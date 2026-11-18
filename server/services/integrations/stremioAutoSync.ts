import { Cron } from "croner";
import mongoose, { Schema, Types } from "mongoose";
import UserIntegration from "../../models/UserIntegration";
import stremioPipelineService, {
  StremioPipelineError,
  StremioPipelineService,
} from "./stremioPipelineService";

// Daily automatic Stremio sync. Every connected integration is run through the
// same pipeline (and per-user sync lease) as the manual "Sync" button.
//
// Config (env):
//   STREMIO_AUTO_SYNC_ENABLED  "true" to schedule in this process (default off,
//                              so local dev pointed at a shared DB never runs it)
//   STREMIO_AUTO_SYNC_CRON     cron pattern, default "0 5 * * *" (05:00 daily)
//   STREMIO_AUTO_SYNC_TZ       IANA timezone, default "America/Toronto"

export const DEFAULT_AUTO_SYNC_CRON = "0 5 * * *";
export const DEFAULT_AUTO_SYNC_TIMEZONE = "America/Toronto";
const JOB_NAME = "stremio-auto-sync";
const RUN_RECORD_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface StremioAutoSyncConfig {
  enabled: boolean;
  cron: string;
  timezone: string;
}

const isValidTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const readStremioAutoSyncConfig = (
  env: NodeJS.ProcessEnv = process.env
): StremioAutoSyncConfig => {
  const timezone = env.STREMIO_AUTO_SYNC_TZ?.trim() || DEFAULT_AUTO_SYNC_TIMEZONE;
  if (!isValidTimezone(timezone)) {
    throw new Error(`STREMIO_AUTO_SYNC_TZ "${timezone}" is not a valid IANA timezone.`);
  }
  return {
    enabled: env.STREMIO_AUTO_SYNC_ENABLED?.trim().toLowerCase() === "true",
    cron: env.STREMIO_AUTO_SYNC_CRON?.trim() || DEFAULT_AUTO_SYNC_CRON,
    timezone,
  };
};

// One record per scheduled slot. Its unique _id is the claim: if several
// server instances fire for the same slot, only the first insert wins.
interface IJobRun {
  _id: string;
  job: string;
  scheduledFor: Date;
  startedAt: Date;
  finishedAt?: Date;
  summary?: StremioAutoSyncSummary;
  expireAt: Date;
}

const jobRunSchema = new Schema<IJobRun>(
  {
    _id: { type: String, required: true },
    job: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    summary: { type: Schema.Types.Mixed },
    expireAt: { type: Date, required: true },
  },
  { versionKey: false }
);
jobRunSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const JobRun =
  (mongoose.models.JobRun as mongoose.Model<IJobRun>) ||
  mongoose.model<IJobRun>("JobRun", jobRunSchema);

export interface StremioAutoSyncSummary {
  total: number;
  succeeded: number;
  skippedInProgress: number;
  failed: number;
}

interface Logger {
  info(message: string): void;
  error(message: string): void;
}

const consoleLogger: Logger = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
};

const errorCode = (error: unknown) =>
  error instanceof StremioPipelineError ? error.code : "unexpected_error";

// Runs one pass over every connected Stremio integration, one user at a time
// (keeps Stremio/TMDB request volume flat). A failure is logged and counted,
// never allowed to stop the remaining users.
export const runStremioAutoSync = async ({
  pipeline = stremioPipelineService,
  logger = consoleLogger,
}: {
  pipeline?: StremioPipelineService;
  logger?: Logger;
} = {}): Promise<StremioAutoSyncSummary> => {
  const summary: StremioAutoSyncSummary = {
    total: 0,
    succeeded: 0,
    skippedInProgress: 0,
    failed: 0,
  };
  const cursor = UserIntegration.find({ provider: "stremio", status: "connected" })
    .select("_id userId")
    .lean<{ _id: Types.ObjectId; userId: Types.ObjectId }[]>()
    .cursor();

  for await (const integration of cursor) {
    summary.total += 1;
    try {
      await pipeline.syncCurrentStremioIntegration(integration.userId.toString(), {
        trigger: "scheduled",
      });
      summary.succeeded += 1;
    } catch (error) {
      if (error instanceof StremioPipelineError && error.code === "stremio_sync_in_progress") {
        summary.skippedInProgress += 1;
        continue;
      }
      summary.failed += 1;
      logger.error(
        `[stremio-auto-sync] integration ${integration._id.toString()} failed: ${errorCode(error)}`
      );
    }
  }
  return summary;
};

// Instances fire a few milliseconds apart, so the slot key is the minute.
const slotId = (scheduledFor: Date) =>
  `${JOB_NAME}:${new Date(Math.floor(scheduledFor.getTime() / 60_000) * 60_000).toISOString()}`;

// Claims the slot, then runs the pass. Returns null when another instance
// already claimed it or the database is not connected.
export const runClaimedStremioAutoSync = async ({
  scheduledFor,
  now = () => new Date(),
  logger = consoleLogger,
  pipeline,
}: {
  scheduledFor: Date;
  now?: () => Date;
  logger?: Logger;
  pipeline?: StremioPipelineService;
}): Promise<StremioAutoSyncSummary | null> => {
  if (mongoose.connection.readyState !== 1) {
    logger.error("[stremio-auto-sync] skipped: database is not connected");
    return null;
  }
  const startedAt = now();
  try {
    await JobRun.create({
      _id: slotId(scheduledFor),
      job: JOB_NAME,
      scheduledFor,
      startedAt,
      expireAt: new Date(startedAt.getTime() + RUN_RECORD_TTL_SECONDS * 1000),
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      logger.info("[stremio-auto-sync] slot already claimed by another instance");
      return null;
    }
    throw error;
  }

  logger.info(`[stremio-auto-sync] started for slot ${scheduledFor.toISOString()}`);
  const summary = await runStremioAutoSync({ pipeline, logger });
  await JobRun.updateOne(
    { _id: slotId(scheduledFor) },
    { $set: { finishedAt: now(), summary } }
  );
  logger.info(
    `[stremio-auto-sync] finished: ${summary.succeeded} synced, ` +
      `${summary.skippedInProgress} already in progress, ${summary.failed} failed ` +
      `(of ${summary.total})`
  );
  return summary;
};

let scheduledJob: Cron | null = null;
let activeConfig: StremioAutoSyncConfig | null = null;

export const startStremioAutoSync = (
  config: StremioAutoSyncConfig = readStremioAutoSyncConfig()
): Cron | null => {
  activeConfig = config;
  if (!config.enabled || scheduledJob) return scheduledJob;

  scheduledJob = new Cron(
    config.cron,
    {
      name: JOB_NAME,
      timezone: config.timezone,
      // Never start a second in-process pass while one is still running.
      protect: true,
      catch: (error) => {
        console.error("[stremio-auto-sync] run crashed:", error);
      },
    },
    async (job: Cron) => {
      const scheduledFor = job.currentRun() ?? new Date();
      await runClaimedStremioAutoSync({ scheduledFor });
    }
  );
  console.log(
    `[stremio-auto-sync] scheduled "${config.cron}" (${config.timezone}); next run ` +
      `${scheduledJob.nextRun()?.toISOString() ?? "never"}`
  );
  return scheduledJob;
};

export const stopStremioAutoSync = () => {
  scheduledJob?.stop();
  scheduledJob = null;
};

export interface StremioAutoSyncStatus {
  enabled: boolean;
  timezone: string;
  nextRunAt: string | null;
}

export const getStremioAutoSyncStatus = (): StremioAutoSyncStatus => {
  const config = activeConfig ?? readStremioAutoSyncConfig();
  return {
    enabled: Boolean(config.enabled && scheduledJob),
    timezone: config.timezone,
    nextRunAt: scheduledJob?.nextRun()?.toISOString() ?? null,
  };
};
