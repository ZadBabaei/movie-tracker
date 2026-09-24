import stremioHistoryImportService, {
  StremioHistoryImportSummary,
} from "./stremioHistoryImportService";
import stremioMovieMatchService, {
  StremioMovieMatchSummary,
} from "./stremioMovieMatchService";
import { StremioClientError } from "./stremioClient";
import stremioSyncService, { StremioSyncError } from "./stremioSyncService";

export interface StremioSnapshotSummary {
  snapshotItems: number;
  movieStates: number;
  ignoredItems: number;
  observed: number;
  upserted: number;
  matched: number;
  modified: number;
}

export interface StremioPipelineResult {
  provider: "stremio";
  status: "success";
  snapshot: StremioSnapshotSummary;
  matching: StremioMovieMatchSummary;
  import: StremioHistoryImportSummary;
}

export type StremioPipelineErrorCode =
  | "stremio_not_connected"
  | "stremio_reauth_required"
  | "stremio_provider_unavailable"
  | "stremio_sync_failed"
  | "integration_changed";

export class StremioPipelineError extends Error {
  constructor(public readonly code: StremioPipelineErrorCode) {
    super(code);
    this.name = "StremioPipelineError";
  }
}

interface SnapshotService {
  sync(userId: string): Promise<StremioSnapshotSummary & { status: "success" }>;
}

interface MatchingService {
  matchCurrentStremioMovies(userId: string): Promise<StremioMovieMatchSummary>;
}

interface ImportService {
  importCurrentStremioMovies(userId: string): Promise<StremioHistoryImportSummary>;
}

export interface StremioPipelineService {
  syncCurrentStremioIntegration(userId: string): Promise<StremioPipelineResult>;
}

const normalizeSnapshotError = (error: unknown): StremioPipelineError => {
  if (error instanceof StremioSyncError) {
    if (error.code === "integration_not_connected") {
      return new StremioPipelineError("stremio_not_connected");
    }
    if (error.code === "integration_reauth_required") {
      return new StremioPipelineError("stremio_reauth_required");
    }
    if (error.code === "integration_changed") {
      return new StremioPipelineError("integration_changed");
    }
    return new StremioPipelineError("stremio_sync_failed");
  }
  if (error instanceof StremioClientError) {
    if (error.code === "invalid_session") {
      return new StremioPipelineError("stremio_reauth_required");
    }
    if (error.code === "provider_unavailable" || error.code === "network_error") {
      return new StremioPipelineError("stremio_provider_unavailable");
    }
    return new StremioPipelineError("stremio_sync_failed");
  }
  return new StremioPipelineError("stremio_sync_failed");
};

export const createStremioPipelineService = ({
  snapshotService = stremioSyncService,
  matchingService = stremioMovieMatchService,
  importService = stremioHistoryImportService,
}: {
  snapshotService?: SnapshotService;
  matchingService?: MatchingService;
  importService?: ImportService;
} = {}): StremioPipelineService => ({
  async syncCurrentStremioIntegration(userId) {
    let snapshotResult: Awaited<ReturnType<SnapshotService["sync"]>>;
    try {
      snapshotResult = await snapshotService.sync(userId);
    } catch (error) {
      throw normalizeSnapshotError(error);
    }

    let matching: StremioMovieMatchSummary;
    try {
      matching = await matchingService.matchCurrentStremioMovies(userId);
    } catch {
      throw new StremioPipelineError("stremio_sync_failed");
    }

    let importSummary: StremioHistoryImportSummary;
    try {
      importSummary = await importService.importCurrentStremioMovies(userId);
    } catch {
      throw new StremioPipelineError("stremio_sync_failed");
    }

    const { status: _snapshotStatus, ...snapshot } = snapshotResult;
    return {
      provider: "stremio",
      status: "success",
      snapshot,
      matching,
      import: importSummary,
    };
  },
});

const stremioPipelineService = createStremioPipelineService();

export default stremioPipelineService;
