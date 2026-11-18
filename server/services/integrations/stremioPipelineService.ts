import { Types } from "mongoose";
import UserIntegration, { IntegrationSyncTrigger } from "../../models/UserIntegration";
import stremioHistoryImportService, {
  StremioHistoryImportSummary,
} from "./stremioHistoryImportService";
import stremioMovieMatchService, {
  StremioMovieMatchSummary,
} from "./stremioMovieMatchService";
import { StremioClientError } from "./stremioClient";
import stremioSyncService, { StremioSyncError } from "./stremioSyncService";
import stremioSyncLockService, { StremioSyncLockService } from "./stremioSyncLock";

export interface StremioSnapshotSummary {
  snapshotItems: number;
  movieStates: number;
  tvSeriesExamined?: number;
  tvEpisodeStates?: number;
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
  | "stremio_sync_in_progress"
  | "integration_changed";

export class StremioPipelineError extends Error {
  constructor(public readonly code: StremioPipelineErrorCode) {
    super(code);
    this.name = "StremioPipelineError";
  }
}

interface SnapshotService {
  sync(userId: string): Promise<StremioSnapshotSummary & {
    status: "success";
    integrationId: string;
    credentialVersion: number;
  }>;
}

interface MatchingService {
  matchCurrentStremioMovies(userId: string): Promise<StremioMovieMatchSummary>;
}

interface ImportService {
  importCurrentStremioMovies(userId: string): Promise<StremioHistoryImportSummary>;
}

interface GenerationService {
  isCurrent(integrationId: string, credentialVersion: number): Promise<boolean>;
}

interface PipelineLifecycleService {
  completeSuccess(
    integrationId: string,
    credentialVersion: number,
    completedAt: Date
  ): Promise<boolean>;
  completeFailure(
    integrationId: string,
    credentialVersion: number,
    completedAt: Date,
    errorCode: string
  ): Promise<boolean>;
}

export interface StremioPipelineSyncOptions {
  trigger?: IntegrationSyncTrigger;
}

export interface StremioPipelineService {
  syncCurrentStremioIntegration(
    userId: string,
    options?: StremioPipelineSyncOptions
  ): Promise<StremioPipelineResult>;
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

const versionCondition = (credentialVersion: number) =>
  credentialVersion === 0
    ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
    : { credentialVersion };

const defaultGenerationService: GenerationService = {
  async isCurrent(integrationId, credentialVersion) {
    if (!Types.ObjectId.isValid(integrationId)) return false;
    return Boolean(await UserIntegration.exists({
      _id: new Types.ObjectId(integrationId),
      status: "connected",
      ...versionCondition(credentialVersion),
    }));
  },
};

const currentIntegrationFilter = (integrationId: string, credentialVersion: number) => ({
  _id: new Types.ObjectId(integrationId),
  status: "connected" as const,
  ...versionCondition(credentialVersion),
});

const defaultLifecycleService: PipelineLifecycleService = {
  async completeSuccess(integrationId, credentialVersion, completedAt) {
    if (!Types.ObjectId.isValid(integrationId)) return false;
    const result = await UserIntegration.updateOne(
      currentIntegrationFilter(integrationId, credentialVersion),
      {
        $set: {
          lastSyncCompletedAt: completedAt,
          lastSuccessfulSyncAt: completedAt,
          lastSyncStatus: "success",
        },
        $unset: { lastErrorCode: 1 },
      }
    );
    return result.matchedCount === 1;
  },

  async completeFailure(integrationId, credentialVersion, completedAt, errorCode) {
    if (!Types.ObjectId.isValid(integrationId)) return false;
    const result = await UserIntegration.updateOne(
      currentIntegrationFilter(integrationId, credentialVersion),
      {
        $set: {
          lastSyncCompletedAt: completedAt,
          lastSyncStatus: "failed",
          lastErrorCode: errorCode.slice(0, 128),
        },
      }
    );
    return result.matchedCount === 1;
  },
};

export const createStremioPipelineService = ({
  snapshotService = stremioSyncService,
  matchingService = stremioMovieMatchService,
  importService = stremioHistoryImportService,
  generationService = defaultGenerationService,
  lifecycleService = defaultLifecycleService,
  lockService,
  now = () => new Date(),
  onLockReleaseError = (error: unknown) => {
    console.error("[stremio-sync] failed to release sync lock:", error);
  },
}: {
  snapshotService?: SnapshotService;
  matchingService?: MatchingService;
  importService?: ImportService;
  generationService?: GenerationService;
  lifecycleService?: PipelineLifecycleService;
  // When provided, every run holds the integration's sync lease, so manual
  // and scheduled syncs of one user never overlap.
  lockService?: StremioSyncLockService;
  now?: () => Date;
  onLockReleaseError?: (error: unknown) => void;
} = {}): StremioPipelineService => {
  const runPipeline = async (userId: string): Promise<StremioPipelineResult> => {
    let snapshotResult: Awaited<ReturnType<SnapshotService["sync"]>>;
    try {
      snapshotResult = await snapshotService.sync(userId);
    } catch (error) {
      throw normalizeSnapshotError(error);
    }

    const requireCurrentSnapshotGeneration = async () => {
      try {
        const current = await generationService.isCurrent(
          snapshotResult.integrationId,
          snapshotResult.credentialVersion
        );
        if (!current) throw new StremioPipelineError("integration_changed");
      } catch (error) {
        if (error instanceof StremioPipelineError) throw error;
        throw new StremioPipelineError("stremio_sync_failed");
      }
    };

    const failCurrentPipeline = async (): Promise<never> => {
      try {
        const completed = await lifecycleService.completeFailure(
          snapshotResult.integrationId,
          snapshotResult.credentialVersion,
          now(),
          "stremio_sync_failed"
        );
        if (!completed) throw new StremioPipelineError("integration_changed");
      } catch (error) {
        if (error instanceof StremioPipelineError) throw error;
        throw new StremioPipelineError("stremio_sync_failed");
      }
      throw new StremioPipelineError("stremio_sync_failed");
    };

    await requireCurrentSnapshotGeneration();

    let matching: StremioMovieMatchSummary;
    try {
      matching = await matchingService.matchCurrentStremioMovies(userId);
    } catch {
      return failCurrentPipeline();
    }

    await requireCurrentSnapshotGeneration();

    let importSummary: StremioHistoryImportSummary;
    try {
      importSummary = await importService.importCurrentStremioMovies(userId);
    } catch {
      return failCurrentPipeline();
    }

    await requireCurrentSnapshotGeneration();

    let finalized: boolean;
    try {
      finalized = await lifecycleService.completeSuccess(
        snapshotResult.integrationId,
        snapshotResult.credentialVersion,
        now()
      );
    } catch {
      throw new StremioPipelineError("stremio_sync_failed");
    }
    if (!finalized) throw new StremioPipelineError("integration_changed");

    const {
      status: _snapshotStatus,
      integrationId: _integrationId,
      credentialVersion: _credentialVersion,
      ...snapshot
    } = snapshotResult;
    return {
      provider: "stremio",
      status: "success",
      snapshot,
      matching,
      import: importSummary,
    };
  };

  return {
    async syncCurrentStremioIntegration(userId, { trigger = "manual" } = {}) {
      if (!lockService) return runPipeline(userId);

      let lock: Awaited<ReturnType<StremioSyncLockService["acquire"]>>;
      try {
        lock = await lockService.acquire(userId, trigger);
      } catch {
        throw new StremioPipelineError("stremio_sync_failed");
      }
      if (lock.status === "busy") throw new StremioPipelineError("stremio_sync_in_progress");
      if (lock.status === "missing") throw new StremioPipelineError("stremio_not_connected");

      try {
        return await runPipeline(userId);
      } finally {
        try {
          await lockService.release(userId, lock.token);
        } catch (error) {
          onLockReleaseError(error);
        }
      }
    },
  };
};

const stremioPipelineService = createStremioPipelineService({
  lockService: stremioSyncLockService,
});

export default stremioPipelineService;
