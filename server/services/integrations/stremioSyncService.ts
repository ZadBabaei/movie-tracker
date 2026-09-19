import { AnyBulkWriteOperation, Types } from "mongoose";
import IntegrationMediaState, {
  IIntegrationMediaState,
} from "../../models/IntegrationMediaState";
import UserIntegration, {
  ICredentialEnvelope,
} from "../../models/UserIntegration";
import { decryptCredential } from "./credentialCrypto";
import stremioClient, {
  StremioClientError,
  StremioSnapshotClient,
} from "./stremioClient";
import {
  NormalizedStremioMovieState,
  normalizeStremioMovieSnapshot,
} from "./stremioSnapshot";

const BULK_WRITE_SIZE = 500;

export type StremioSyncErrorCode =
  | "integration_not_connected"
  | "integration_changed"
  | "credential_decryption_failed";

export class StremioSyncError extends Error {
  constructor(public readonly code: StremioSyncErrorCode) {
    super(code);
    this.name = "StremioSyncError";
  }
}

interface CryptoDependency {
  decryptCredential(envelope: ICredentialEnvelope): string;
}

interface IngestionResult {
  observed: number;
  upserted: number;
  matched: number;
  modified: number;
}

const identityKey = (state: NormalizedStremioMovieState) =>
  `${state.providerMediaType}\u0000${state.identifierNamespace}\u0000${state.providerItemId}`;

const duplicateOnly = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: number;
    writeErrors?: Array<{ code?: number }>;
  };
  if (candidate.writeErrors?.length) {
    return candidate.writeErrors.every((writeError) => writeError.code === 11000);
  }
  return candidate.code === 11000;
};

const operationsFor = (
  integrationId: Types.ObjectId,
  states: NormalizedStremioMovieState[],
  observedAt: Date,
  observedCredentialVersion: number,
  upsert: boolean
): AnyBulkWriteOperation<IIntegrationMediaState>[] =>
  states.map((state) => {
    const preserveCompletedAfterRemoval = state.removed && !state.completed;
    const completed = preserveCompletedAfterRemoval
      ? {
          $cond: [
            {
              $eq: [
                { $ifNull: ["$observedCredentialVersion", 0] },
                observedCredentialVersion,
              ],
            },
            { $ifNull: ["$completed", false] },
            false,
          ],
        }
      : state.completed;
    return {
      updateOne: {
        filter: {
          integrationId,
          providerMediaType: state.providerMediaType,
          identifierNamespace: state.identifierNamespace,
          providerItemId: state.providerItemId,
          $or: [
            { observedCredentialVersion: { $lte: observedCredentialVersion } },
            { observedCredentialVersion: { $exists: false } },
          ],
        },
        update: [
          {
            $set: {
              integrationId,
              providerMediaType: state.providerMediaType,
              identifierNamespace: state.identifierNamespace,
              providerItemId: { $literal: state.providerItemId },
              completed,
              removed: state.removed,
              lastSeenAt: observedAt,
              timestampConfidence: state.timestampConfidence,
              providerRevision:
                state.providerRevision === undefined
                  ? "$$REMOVE"
                  : { $literal: state.providerRevision },
              providerLastWatchedAt:
                state.providerLastWatchedAt === undefined
                  ? "$$REMOVE"
                  : state.providerLastWatchedAt,
              matchStatus: { $ifNull: ["$matchStatus", "unresolved"] },
              importStatus: { $ifNull: ["$importStatus", "pending"] },
              createdAt: { $ifNull: ["$createdAt", "$$NOW"] },
              // Completion and version are evaluated from the same pre-update
              // document in this atomic aggregation stage.
              observedCredentialVersion,
            },
          },
        ],
        upsert,
      },
    };
  });

export const ingestStremioMovieStates = async (
  integrationId: Types.ObjectId,
  states: NormalizedStremioMovieState[],
  observedAt: Date,
  observedCredentialVersion: number
): Promise<IngestionResult> => {
  if (!Number.isSafeInteger(observedCredentialVersion) || observedCredentialVersion < 0) {
    throw new RangeError("observedCredentialVersion must be a nonnegative safe integer");
  }
  // Full-snapshot absence is deliberately a no-op. Stremio exposes explicit
  // `removed` tombstones, so only rows actually observed in this snapshot are
  // updated; older provenance/import links are never deleted or fabricated.
  const uniqueStates = [...new Map(states.map((state) => [identityKey(state), state])).values()];
  const totals: IngestionResult = { observed: uniqueStates.length, upserted: 0, matched: 0, modified: 0 };

  for (let index = 0; index < uniqueStates.length; index += BULK_WRITE_SIZE) {
    const chunk = uniqueStates.slice(index, index + BULK_WRITE_SIZE);
    try {
      const result = await IntegrationMediaState.bulkWrite(
        operationsFor(
          integrationId,
          chunk,
          observedAt,
          observedCredentialVersion,
          true
        ),
        { ordered: false }
      );
      totals.upserted += result.upsertedCount;
      totals.matched += result.matchedCount;
      totals.modified += result.modifiedCount;
    } catch (error) {
      if (!duplicateOnly(error)) throw error;
      const retry = await IntegrationMediaState.bulkWrite(
        operationsFor(
          integrationId,
          chunk,
          observedAt,
          observedCredentialVersion,
          false
        ),
        { ordered: false }
      );
      totals.matched += retry.matchedCount;
      totals.modified += retry.modifiedCount;
    }
  }
  return totals;
};

// Downstream work may process only rows whose observation generation equals
// the integration's current credential generation. Missing legacy values are
// generation zero and remain eligible only while the integration is also zero.
export const currentStremioProviderStateFilter = (
  integrationId: Types.ObjectId,
  credentialVersion: number
) => ({
  integrationId,
  ...(credentialVersion === 0
    ? {
        $or: [
          { observedCredentialVersion: 0 },
          { observedCredentialVersion: { $exists: false } },
        ],
      }
    : { observedCredentialVersion: credentialVersion }),
});

const versionCondition = (credentialVersion: number) =>
  credentialVersion === 0
    ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
    : { credentialVersion };

const lifecycleErrorCode = (error: unknown) => {
  if (error instanceof StremioClientError) return error.code;
  if (error instanceof StremioSyncError) return error.code;
  return "provider_state_sync_failed";
};

export const createStremioSyncService = ({
  client = stremioClient,
  cryptoService = { decryptCredential },
  ingest = ingestStremioMovieStates,
  now = () => new Date(),
}: {
  client?: StremioSnapshotClient;
  cryptoService?: CryptoDependency;
  ingest?: typeof ingestStremioMovieStates;
  now?: () => Date;
} = {}) => ({
  async sync(userId: string) {
    const integration = await UserIntegration.findOne({
      userId: new Types.ObjectId(userId),
      provider: "stremio",
    }).select("+credentialEnvelope");
    if (integration?.status !== "connected" || !integration.credentialEnvelope) {
      throw new StremioSyncError("integration_not_connected");
    }

    const credentialVersion = integration.credentialVersion ?? 0;
    const currentFilter = {
      _id: integration._id,
      status: "connected" as const,
      ...versionCondition(credentialVersion),
    };
    const startedAt = now();
    const start = await UserIntegration.updateOne(currentFilter, {
      $set: { lastSyncStartedAt: startedAt },
      $unset: { lastErrorCode: 1 },
    });
    if (start.matchedCount !== 1) throw new StremioSyncError("integration_changed");

    let authKey: string;
    try {
      authKey = cryptoService.decryptCredential(integration.credentialEnvelope);
    } catch (error) {
      await UserIntegration.updateOne(currentFilter, {
        $set: {
          lastSyncCompletedAt: now(),
          lastSyncStatus: "failed",
          lastErrorCode: "credential_decryption_failed",
        },
      });
      throw new StremioSyncError("credential_decryption_failed");
    }

    try {
      const snapshot = await client.getLibrarySnapshot(authKey);
      const stillCurrent = await UserIntegration.exists(currentFilter);
      if (!stillCurrent) throw new StremioSyncError("integration_changed");
      const normalized = normalizeStremioMovieSnapshot(snapshot);
      const observedAt = now();
      const ingestion = await ingest(
        integration._id,
        normalized,
        observedAt,
        credentialVersion
      );
      const completedAt = now();
      const completion = await UserIntegration.updateOne(currentFilter, {
        $set: {
          lastSyncCompletedAt: completedAt,
          lastSuccessfulSyncAt: completedAt,
          lastSyncStatus: "success",
        },
        $unset: { lastErrorCode: 1 },
      });
      if (completion.matchedCount !== 1) {
        throw new StremioSyncError("integration_changed");
      }
      return {
        status: "success" as const,
        snapshotItems: snapshot.length,
        movieStates: normalized.length,
        ignoredItems: snapshot.length - normalized.length,
        ...ingestion,
      };
    } catch (error) {
      const completedAt = now();
      if (error instanceof StremioClientError && error.code === "invalid_session") {
        await UserIntegration.updateOne(currentFilter, {
          $set: {
            status: "reauth_required",
            lastSyncCompletedAt: completedAt,
            lastSyncStatus: "failed",
            lastErrorCode: "provider_session_invalid",
          },
          $unset: { credentialEnvelope: 1 },
        });
      } else if (!(error instanceof StremioSyncError && error.code === "integration_changed")) {
        await UserIntegration.updateOne(currentFilter, {
          $set: {
            lastSyncCompletedAt: completedAt,
            lastSyncStatus: "failed",
            lastErrorCode: lifecycleErrorCode(error).slice(0, 128),
          },
        });
      }
      throw error;
    }
  },
});

const stremioSyncService = createStremioSyncService();

export default stremioSyncService;
