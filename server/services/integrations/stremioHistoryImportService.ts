import { Types } from "mongoose";
import IntegrationMediaState, {
  IIntegrationMediaState,
} from "../../models/IntegrationMediaState";
import Movie from "../../models/movie";
import WatchHistoryEntry, {
  IWatchHistoryEntry,
} from "../../models/WatchHistoryEntry";
import UserIntegration from "../../models/UserIntegration";
import { currentStremioProviderStateFilter } from "./stremioSyncService";

const DEFAULT_CONCURRENCY = 6;

export interface StremioHistoryImportSummary {
  examined: number;
  imported: number;
  alreadyImported: number;
  timestampUnavailable: number;
  invalidMatch: number;
  skippedStale: number;
}

type ImportResult =
  | "imported"
  | "already_imported"
  | "timestamp_unavailable"
  | "invalid_match"
  | "integration_changed";

interface HistoryCreatePayload {
  _id: Types.ObjectId;
  movieId: Types.ObjectId;
  scope: "personal";
  createdBy: Types.ObjectId;
  participants: Types.ObjectId[];
  watchedAt: Date;
  watchedLocation: string;
  watchedNotes: string;
  ratings: [];
  integrationMediaStateId: Types.ObjectId;
}

const versionCondition = (credentialVersion: number) =>
  credentialVersion === 0
    ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
    : { credentialVersion };

const stateVersionCondition = (credentialVersion: number) =>
  credentialVersion === 0
    ? {
        $or: [
          { observedCredentialVersion: 0 },
          { observedCredentialVersion: { $exists: false } },
        ],
      }
    : { observedCredentialVersion: credentialVersion };

const isDuplicateKey = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);

const validProviderWatchTime = (value: Date | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const safeExistingHistory = (
  entry: IWatchHistoryEntry,
  state: IIntegrationMediaState,
  ownerId: Types.ObjectId
) =>
  entry.scope === "personal" &&
  entry.movieId.toString() === state.matchedMovieId?.toString() &&
  entry.createdBy.toString() === ownerId.toString() &&
  !entry.groupId &&
  entry.participants.length === 1 &&
  entry.participants[0].toString() === ownerId.toString();

export const suppressStremioImportAfterHistoryDelete = async (
  entry: Pick<IWatchHistoryEntry, "_id" | "integrationMediaStateId">
): Promise<boolean> => {
  if (!entry.integrationMediaStateId) return false;
  const result = await IntegrationMediaState.updateOne(
    {
      _id: entry.integrationMediaStateId,
      importStatus: "imported",
      importedHistoryEntryId: entry._id,
    },
    {
      $set: {
        importStatus: "suppressed",
        suppressionReason: "local_history_deleted",
      },
      $unset: { importedHistoryEntryId: 1, lastErrorCode: 1 },
    }
  );
  return result.matchedCount === 1;
};

export const createStremioHistoryImportService = ({
  concurrency = DEFAULT_CONCURRENCY,
  now = () => new Date(),
  createHistoryEntry = (payload: HistoryCreatePayload) => WatchHistoryEntry.create(payload),
}: {
  concurrency?: number;
  now?: () => Date;
  createHistoryEntry?: (payload: HistoryCreatePayload) => Promise<IWatchHistoryEntry>;
} = {}) => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new RangeError("concurrency must be an integer between 1 and 32");
  }

  return {
    async importCurrentStremioMovies(userId: string): Promise<StremioHistoryImportSummary> {
      const ownerId = new Types.ObjectId(userId);
      const integration = await UserIntegration.findOne({
        userId: ownerId,
        provider: "stremio",
        status: "connected",
      });
      if (!integration) {
        return {
          examined: 0,
          imported: 0,
          alreadyImported: 0,
          timestampUnavailable: 0,
          invalidMatch: 0,
          skippedStale: 0,
        };
      }

      const credentialVersion = integration.credentialVersion ?? 0;
      const integrationFilter = {
        _id: integration._id,
        status: "connected" as const,
        ...versionCondition(credentialVersion),
      };
      const candidates = await IntegrationMediaState.find({
        ...currentStremioProviderStateFilter(integration._id, credentialVersion),
        providerMediaType: "movie",
        completed: true,
        matchStatus: "matched",
        importStatus: "pending",
        matchedMovieId: { $exists: true },
        matchedTmdbId: { $exists: true },
        importedHistoryEntryId: { $exists: false },
      });
      const summary: StremioHistoryImportSummary = {
        examined: candidates.length,
        imported: 0,
        alreadyImported: 0,
        timestampUnavailable: 0,
        invalidMatch: 0,
        skippedStale: 0,
      };

      const stateFilter = (state: IIntegrationMediaState) => ({
        _id: state._id,
        integrationId: integration._id,
        ...stateVersionCondition(credentialVersion),
        providerMediaType: "movie" as const,
        completed: true,
        matchStatus: "matched" as const,
        importStatus: "pending" as const,
        matchedMovieId: state.matchedMovieId,
        matchedTmdbId: state.matchedTmdbId,
      });

      const recordPendingError = async (
        state: IIntegrationMediaState,
        lastErrorCode: "provider_watch_time_unknown" | "matched_movie_inconsistent"
      ) => {
        if (!(await UserIntegration.exists(integrationFilter))) return false;
        const result = await IntegrationMediaState.updateOne(
          { ...stateFilter(state), importedHistoryEntryId: { $exists: false } },
          { $set: { lastErrorCode }, $unset: { suppressionReason: 1 } }
        );
        return result.matchedCount === 1;
      };

      const clearReservation = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId,
        lastErrorCode?: string
      ) => {
        await IntegrationMediaState.updateOne(
          {
            _id: state._id,
            integrationId: integration._id,
            importStatus: "pending",
            importedHistoryEntryId: historyEntryId,
          },
          {
            ...(lastErrorCode ? { $set: { lastErrorCode: lastErrorCode.slice(0, 128) } } : {}),
            $unset: { importedHistoryEntryId: 1 },
          }
        );
      };

      const removeUnfinalizedHistory = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId
      ) => {
        await WatchHistoryEntry.deleteOne({
          _id: historyEntryId,
          integrationMediaStateId: state._id,
        });
        await clearReservation(state, historyEntryId);
      };

      const processState = async (state: IIntegrationMediaState): Promise<ImportResult> => {
        if (!validProviderWatchTime(state.providerLastWatchedAt)) {
          return (await recordPendingError(state, "provider_watch_time_unknown"))
            ? "timestamp_unavailable"
            : "integration_changed";
        }

        const movie = await Movie.findOne({
          _id: state.matchedMovieId,
          imdbID: `tmdb-${state.matchedTmdbId}`,
        }).select("_id imdbID");
        if (!movie) {
          return (await recordPendingError(state, "matched_movie_inconsistent"))
            ? "invalid_match"
            : "integration_changed";
        }
        if (!(await UserIntegration.exists(integrationFilter))) return "integration_changed";

        let historyEntryId = new Types.ObjectId();
        const claim = await IntegrationMediaState.updateOne(
          { ...stateFilter(state), importedHistoryEntryId: { $exists: false } },
          {
            $set: { importedHistoryEntryId: historyEntryId },
            $unset: { lastErrorCode: 1, suppressionReason: 1 },
          }
        );
        if (claim.matchedCount !== 1) {
          const current = await IntegrationMediaState.findById(state._id)
            .select("importStatus importedHistoryEntryId")
            .lean();
          return current?.importStatus === "imported" || current?.importedHistoryEntryId
            ? "already_imported"
            : "integration_changed";
        }

        if (!(await UserIntegration.exists(integrationFilter))) {
          await clearReservation(state, historyEntryId);
          return "integration_changed";
        }

        let historyEntry: IWatchHistoryEntry;
        try {
          historyEntry = await createHistoryEntry({
            _id: historyEntryId,
            movieId: movie._id,
            scope: "personal",
            createdBy: ownerId,
            participants: [ownerId],
            watchedAt: state.providerLastWatchedAt,
            watchedLocation: "",
            watchedNotes: "",
            ratings: [],
            integrationMediaStateId: state._id,
          });
        } catch (error) {
          if (!isDuplicateKey(error)) {
            await clearReservation(state, historyEntryId, "history_import_failed");
            throw error;
          }
          const existing = await WatchHistoryEntry.findOne({
            integrationMediaStateId: state._id,
          }).select("+integrationMediaStateId");
          if (!existing || !safeExistingHistory(existing, state, ownerId)) {
            await clearReservation(state, historyEntryId, "history_provenance_conflict");
            return "invalid_match";
          }
          const reservation = await IntegrationMediaState.updateOne(
            {
              _id: state._id,
              importStatus: "pending",
              importedHistoryEntryId: historyEntryId,
            },
            { $set: { importedHistoryEntryId: existing._id } }
          );
          if (reservation.matchedCount !== 1) return "integration_changed";
          historyEntry = existing;
          historyEntryId = existing._id;
        }

        if (!(await UserIntegration.exists(integrationFilter))) {
          await removeUnfinalizedHistory(state, historyEntryId);
          return "integration_changed";
        }
        const finalized = await IntegrationMediaState.updateOne(
          {
            ...stateFilter(state),
            importedHistoryEntryId: historyEntryId,
          },
          {
            $set: {
              importStatus: "imported",
              importedAt: now(),
            },
            $unset: { lastErrorCode: 1, suppressionReason: 1 },
          }
        );
        if (finalized.matchedCount === 1) return "imported";

        const current = await IntegrationMediaState.findById(state._id)
          .select("importStatus importedHistoryEntryId")
          .lean();
        if (
          current?.importStatus === "imported" &&
          current.importedHistoryEntryId?.toString() === historyEntryId.toString()
        ) {
          return "already_imported";
        }
        await removeUnfinalizedHistory(state, historyEntryId);
        return "integration_changed";
      };

      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < candidates.length) {
          const result = await processState(candidates[nextIndex++]);
          if (result === "imported") summary.imported += 1;
          else if (result === "already_imported") summary.alreadyImported += 1;
          else if (result === "timestamp_unavailable") summary.timestampUnavailable += 1;
          else if (result === "invalid_match") summary.invalidMatch += 1;
          else summary.skippedStale += 1;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker())
      );
      return summary;
    },
  };
};

const stremioHistoryImportService = createStremioHistoryImportService();

export default stremioHistoryImportService;
