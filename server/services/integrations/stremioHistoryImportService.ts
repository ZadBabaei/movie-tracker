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
    ? { $or: [{ observedCredentialVersion: 0 }, { observedCredentialVersion: { $exists: false } }] }
    : { observedCredentialVersion: credentialVersion };

const reservationVersionCondition = (credentialVersion: number | undefined) =>
  credentialVersion === undefined
    ? { importReservationCredentialVersion: { $exists: false } }
    : { importReservationCredentialVersion: credentialVersion };

const isDuplicateKey = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);

const validProviderWatchTime = (value: Date | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const safeExistingHistory = (
  entry: IWatchHistoryEntry,
  state: IIntegrationMediaState,
  ownerId: Types.ObjectId
) =>
  entry.integrationMediaStateId?.toString() === state._id.toString() &&
  entry.scope === "personal" &&
  entry.movieId.toString() === state.matchedMovieId?.toString() &&
  entry.createdBy.toString() === ownerId.toString() &&
  !entry.groupId &&
  entry.participants.length === 1 &&
  entry.participants[0].toString() === ownerId.toString() &&
  validProviderWatchTime(entry.watchedAt);

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
      $set: { importStatus: "suppressed", suppressionReason: "local_history_deleted" },
      $unset: {
        importedHistoryEntryId: 1,
        importReservationCredentialVersion: 1,
        lastErrorCode: 1,
      },
    }
  );
  return result.matchedCount === 1;
};

export const createStremioHistoryImportService = ({
  concurrency = DEFAULT_CONCURRENCY,
  now = () => new Date(),
  createHistoryEntry = (payload: HistoryCreatePayload) => WatchHistoryEntry.create(payload),
  beforeFinalize = async () => undefined,
}: {
  concurrency?: number;
  now?: () => Date;
  createHistoryEntry?: (payload: HistoryCreatePayload) => Promise<IWatchHistoryEntry>;
  beforeFinalize?: () => Promise<void>;
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
        lastErrorCode:
          | "provider_watch_time_unknown"
          | "matched_movie_inconsistent"
          | "history_provenance_conflict"
      ) => {
        if (!(await UserIntegration.exists(integrationFilter))) return false;
        const result = await IntegrationMediaState.updateOne(
          stateFilter(state),
          { $set: { lastErrorCode }, $unset: { suppressionReason: 1 } }
        );
        return result.matchedCount === 1;
      };

      const releaseReservation = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId,
        reservationVersion: number | undefined,
        lastErrorCode?: string
      ) => {
        const result = await IntegrationMediaState.updateOne(
          {
            _id: state._id,
            integrationId: integration._id,
            importStatus: "pending",
            importedHistoryEntryId: historyEntryId,
            ...reservationVersionCondition(reservationVersion),
          },
          {
            ...(lastErrorCode ? { $set: { lastErrorCode: lastErrorCode.slice(0, 128) } } : {}),
            $unset: {
              importedHistoryEntryId: 1,
              importReservationCredentialVersion: 1,
            },
          }
        );
        return result.matchedCount === 1;
      };

      const removeOwnedUnfinalizedHistory = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId,
        reservationVersion: number | undefined
      ) => {
        const released = await releaseReservation(state, historyEntryId, reservationVersion);
        if (released) {
          await WatchHistoryEntry.deleteOne({
            _id: historyEntryId,
            integrationMediaStateId: state._id,
          });
          return;
        }
        const current = await IntegrationMediaState.findById(state._id)
          .select("importStatus importedHistoryEntryId")
          .lean();
        if (
          current?.importStatus !== "imported" ||
          current.importedHistoryEntryId?.toString() !== historyEntryId.toString()
        ) {
          await WatchHistoryEntry.deleteOne({
            _id: historyEntryId,
            integrationMediaStateId: state._id,
          });
        }
      };

      const findReservedHistory = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId
      ) => {
        const exact = await WatchHistoryEntry.findById(historyEntryId)
          .select("+integrationMediaStateId");
        if (exact) return { exact, conflictingProvenanceId: undefined };
        const conflictingProvenance = await WatchHistoryEntry.findOne({
          integrationMediaStateId: state._id,
        }).select("_id");
        return { exact: null, conflictingProvenanceId: conflictingProvenance?._id };
      };

      const finalizeReservation = async (
        state: IIntegrationMediaState,
        historyEntryId: Types.ObjectId
      ): Promise<ImportResult> => {
        await beforeFinalize();
        if (!(await UserIntegration.exists(integrationFilter))) {
          await removeOwnedUnfinalizedHistory(
            state,
            historyEntryId,
            state.importReservationCredentialVersion
          );
          return "integration_changed";
        }
        const finalized = await IntegrationMediaState.updateOne(
          {
            ...stateFilter(state),
            importedHistoryEntryId: historyEntryId,
            importReservationCredentialVersion: credentialVersion,
          },
          {
            $set: { importStatus: "imported", importedAt: now() },
            $unset: {
              importReservationCredentialVersion: 1,
              lastErrorCode: 1,
              suppressionReason: 1,
            },
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
        await removeOwnedUnfinalizedHistory(
          state,
          historyEntryId,
          state.importReservationCredentialVersion
        );
        return "integration_changed";
      };

      const processFreshState = async (
        state: IIntegrationMediaState,
        movieId: Types.ObjectId
      ): Promise<ImportResult> => {
        if (!(await UserIntegration.exists(integrationFilter))) return "integration_changed";
        const historyEntryId = new Types.ObjectId();
        const claim = await IntegrationMediaState.updateOne(
          { ...stateFilter(state), importedHistoryEntryId: { $exists: false } },
          {
            $set: {
              importedHistoryEntryId: historyEntryId,
              importReservationCredentialVersion: credentialVersion,
            },
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
        state.importedHistoryEntryId = historyEntryId;
        state.importReservationCredentialVersion = credentialVersion;

        if (!(await UserIntegration.exists(integrationFilter))) {
          await releaseReservation(state, historyEntryId, credentialVersion);
          return "integration_changed";
        }

        let historyEntry: IWatchHistoryEntry;
        try {
          historyEntry = await createHistoryEntry({
            _id: historyEntryId,
            movieId,
            scope: "personal",
            createdBy: ownerId,
            participants: [ownerId],
            watchedAt: state.providerLastWatchedAt!,
            watchedLocation: "",
            watchedNotes: "",
            ratings: [],
            integrationMediaStateId: state._id,
          });
        } catch (error) {
          if (!isDuplicateKey(error)) {
            await releaseReservation(
              state,
              historyEntryId,
              credentialVersion,
              "history_import_failed"
            );
            throw error;
          }
          const existing = await WatchHistoryEntry.findById(historyEntryId)
            .select("+integrationMediaStateId");
          if (!existing || !safeExistingHistory(existing, state, ownerId)) {
            await recordPendingError(state, "history_provenance_conflict");
            return "invalid_match";
          }
          historyEntry = existing;
        }

        if (!safeExistingHistory(historyEntry, state, ownerId)) {
          await recordPendingError(state, "history_provenance_conflict");
          return "invalid_match";
        }
        return finalizeReservation(state, historyEntryId);
      };

      const processReservedState = async (
        state: IIntegrationMediaState,
        movieId: Types.ObjectId
      ): Promise<ImportResult> => {
        const historyEntryId = state.importedHistoryEntryId!;
        const reservationVersion = state.importReservationCredentialVersion;
        const { exact, conflictingProvenanceId } = await findReservedHistory(
          state,
          historyEntryId
        );

        if (reservationVersion !== credentialVersion) {
          const released = await releaseReservation(state, historyEntryId, reservationVersion);
          if (!released) return "already_imported";
          if (exact?.integrationMediaStateId?.equals(state._id)) {
            await WatchHistoryEntry.deleteOne({
              _id: historyEntryId,
              integrationMediaStateId: state._id,
            });
          } else if (conflictingProvenanceId) {
            await WatchHistoryEntry.deleteOne({
              _id: conflictingProvenanceId,
              integrationMediaStateId: state._id,
            });
          }
          state.importedHistoryEntryId = undefined;
          state.importReservationCredentialVersion = undefined;
          return processFreshState(state, movieId);
        }

        if (
          (exact && !safeExistingHistory(exact, state, ownerId)) ||
          (!exact && conflictingProvenanceId)
        ) {
          return (await recordPendingError(state, "history_provenance_conflict"))
            ? "invalid_match"
            : "integration_changed";
        }

        if (exact) return finalizeReservation(state, historyEntryId);

        const released = await releaseReservation(state, historyEntryId, reservationVersion);
        if (!released) return "already_imported";
        state.importedHistoryEntryId = undefined;
        state.importReservationCredentialVersion = undefined;
        return processFreshState(state, movieId);
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
        return state.importedHistoryEntryId
          ? processReservedState(state, movie._id)
          : processFreshState(state, movie._id);
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
