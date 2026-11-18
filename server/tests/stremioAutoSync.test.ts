import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { Types } from "mongoose";
import UserIntegration from "../models/UserIntegration";
import { createIntegrationRouter } from "../routes/integrationRoutes";
import {
  getStremioAutoSyncStatus,
  JobRun,
  readStremioAutoSyncConfig,
  runClaimedStremioAutoSync,
  runStremioAutoSync,
  startStremioAutoSync,
  stopStremioAutoSync,
} from "../services/integrations/stremioAutoSync";
import {
  createStremioPipelineService,
  StremioPipelineError,
  StremioPipelineResult,
  StremioPipelineService,
} from "../services/integrations/stremioPipelineService";
import { createStremioSyncLockService } from "../services/integrations/stremioSyncLock";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_stremio_auto_sync_test");
  await Promise.all([UserIntegration.syncIndexes(), JobRun.syncIndexes()]);
});

afterEach(async () => {
  await Promise.all([UserIntegration.deleteMany({}), JobRun.deleteMany({})]);
});

after(async () => {
  await testMongo.stop();
});

// Raw inserts skip the credential-envelope validator; these tests exercise
// scheduling and locking only, never the provider.
const seedIntegration = async (status: "connected" | "disconnected" = "connected") => {
  const userId = new Types.ObjectId();
  await UserIntegration.collection.insertOne({
    userId,
    provider: "stremio",
    status,
    credentialVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId.toString();
};

const pipelineResult: StremioPipelineResult = {
  provider: "stremio",
  status: "success",
  snapshot: {
    snapshotItems: 0,
    movieStates: 0,
    ignoredItems: 0,
    observed: 0,
    upserted: 0,
    matched: 0,
    modified: 0,
  },
  matching: {
    examined: 0,
    matched: 0,
    movieMissing: 0,
    unsupported: 0,
    retryableErrors: 0,
    skippedStale: 0,
  },
  import: {
    examined: 0,
    imported: 0,
    alreadyImported: 0,
    timestampUnavailable: 0,
    invalidMatch: 0,
    skippedStale: 0,
  },
};

const quietLogger = () => {
  const errors: string[] = [];
  return { errors, logger: { info: () => undefined, error: (message: string) => errors.push(message) } };
};

// A pipeline whose snapshot stage is a fake, but whose lock is the real
// Mongo-backed lease. `gate` lets a test hold a sync open.
const lockedPipeline = (snapshot: (userId: string) => Promise<void> = async () => undefined) =>
  createStremioPipelineService({
    lockService: createStremioSyncLockService(),
    snapshotService: {
      async sync(userId) {
        await snapshot(userId);
        return {
          ...pipelineResult.snapshot,
          status: "success",
          integrationId: new Types.ObjectId().toString(),
          credentialVersion: 1,
        };
      },
    },
    generationService: { isCurrent: async () => true },
    matchingService: { matchCurrentStremioMovies: async () => pipelineResult.matching },
    importService: { importCurrentStremioMovies: async () => pipelineResult.import },
    lifecycleService: {
      completeSuccess: async () => true,
      completeFailure: async () => true,
    },
  });

test("sync lease admits one holder, rejects others, and is reclaimable after expiry", async () => {
  const userId = await seedIntegration();
  let clock = new Date("2026-11-18T10:00:00.000Z");
  const locks = createStremioSyncLockService({ now: () => clock, ttlMs: () => 60_000 });

  const first = await locks.acquire(userId, "manual");
  assert.equal(first.status, "acquired");
  assert.equal((await locks.acquire(userId, "scheduled")).status, "busy");

  // A stale token must not release the current holder.
  await locks.release(userId, "not-the-holder");
  assert.equal((await locks.acquire(userId, "scheduled")).status, "busy");

  clock = new Date(clock.getTime() + 61_000);
  const reclaimed = await locks.acquire(userId, "scheduled");
  assert.equal(reclaimed.status, "acquired");
  const stored = await UserIntegration.findOne({ userId }).lean();
  assert.equal(stored?.lastSyncTrigger, "scheduled");

  // The expired holder releasing late leaves the new lease intact.
  if (first.status === "acquired") await locks.release(userId, first.token);
  assert.equal((await locks.acquire(userId, "manual")).status, "busy");

  if (reclaimed.status === "acquired") await locks.release(userId, reclaimed.token);
  assert.equal((await locks.acquire(userId, "manual")).status, "acquired");

  assert.equal(
    (await locks.acquire(new Types.ObjectId().toString(), "manual")).status,
    "missing"
  );
});

test("a manual sync started during a scheduled sync is rejected as in progress", async () => {
  const userId = await seedIntegration();
  let releaseFirst!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let snapshotCalls = 0;
  const pipeline = lockedPipeline(async () => {
    snapshotCalls += 1;
    if (snapshotCalls === 1) await held;
  });

  const scheduled = pipeline.syncCurrentStremioIntegration(userId, { trigger: "scheduled" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(
    pipeline.syncCurrentStremioIntegration(userId, { trigger: "manual" }),
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "stremio_sync_in_progress"
  );
  releaseFirst();
  await scheduled;
  assert.equal(snapshotCalls, 1);

  // The lease is released after completion, so the next manual sync runs.
  await pipeline.syncCurrentStremioIntegration(userId, { trigger: "manual" });
  assert.equal(snapshotCalls, 2);
  const stored = await UserIntegration.findOne({ userId }).lean();
  assert.equal(stored?.syncLockToken, undefined);
  assert.equal(stored?.lastSyncTrigger, "manual");
});

test("the lease is released when the pipeline fails", async () => {
  const userId = await seedIntegration();
  const pipeline = lockedPipeline(async () => {
    throw new Error("provider down");
  });
  await assert.rejects(pipeline.syncCurrentStremioIntegration(userId), StremioPipelineError);
  const stored = await UserIntegration.findOne({ userId }).lean();
  assert.equal(stored?.syncLockUntil, undefined);
  assert.equal(stored?.syncLockToken, undefined);
});

test("scheduled pass syncs every connected integration and isolates per-user failures", async () => {
  const ok = await seedIntegration();
  const busy = await seedIntegration();
  const broken = await seedIntegration();
  const disconnected = await seedIntegration("disconnected");
  const calls: Array<{ userId: string; trigger?: string }> = [];
  const pipeline: StremioPipelineService = {
    async syncCurrentStremioIntegration(userId, options) {
      calls.push({ userId, trigger: options?.trigger });
      if (userId === busy) throw new StremioPipelineError("stremio_sync_in_progress");
      if (userId === broken) throw new StremioPipelineError("stremio_provider_unavailable");
      return pipelineResult;
    },
  };
  const { errors, logger } = quietLogger();

  const summary = await runStremioAutoSync({ pipeline, logger });

  assert.deepEqual(summary, { total: 3, succeeded: 1, skippedInProgress: 1, failed: 1 });
  assert.deepEqual(
    calls.map((call) => call.userId).sort(),
    [ok, busy, broken].sort()
  );
  assert.equal(calls.some((call) => call.userId === disconnected), false);
  assert.ok(calls.every((call) => call.trigger === "scheduled"));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stremio_provider_unavailable/);
  assert.equal(errors[0].includes(broken), false);
});

test("a scheduled slot runs once even when several instances fire for it", async () => {
  await seedIntegration();
  let syncs = 0;
  const pipeline: StremioPipelineService = {
    async syncCurrentStremioIntegration() {
      syncs += 1;
      return pipelineResult;
    },
  };
  const { logger } = quietLogger();
  const slot = new Date("2026-11-19T10:00:00.012Z");

  const [first, second] = await Promise.all([
    runClaimedStremioAutoSync({ scheduledFor: slot, pipeline, logger }),
    runClaimedStremioAutoSync({
      scheduledFor: new Date("2026-11-19T10:00:00.480Z"),
      pipeline,
      logger,
    }),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(syncs, 1);
  const record = await JobRun.findOne({}).lean();
  assert.ok(record?.finishedAt);
  assert.deepEqual(record?.summary, { total: 1, succeeded: 1, skippedInProgress: 0, failed: 0 });

  const nextDay = await runClaimedStremioAutoSync({
    scheduledFor: new Date("2026-11-20T10:00:00.000Z"),
    pipeline,
    logger,
  });
  assert.ok(nextDay);
  assert.equal(syncs, 2);
});

test("auto-sync config defaults to off at 05:00 Toronto time and rejects bad zones", () => {
  assert.deepEqual(readStremioAutoSyncConfig({}), {
    enabled: false,
    cron: "0 5 * * *",
    timezone: "America/Toronto",
  });
  assert.deepEqual(
    readStremioAutoSyncConfig({
      STREMIO_AUTO_SYNC_ENABLED: "TRUE",
      STREMIO_AUTO_SYNC_TZ: "Europe/London",
      STREMIO_AUTO_SYNC_CRON: "30 4 * * *",
    }),
    { enabled: true, cron: "30 4 * * *", timezone: "Europe/London" }
  );
  assert.throws(() => readStremioAutoSyncConfig({ STREMIO_AUTO_SYNC_TZ: "Mars/Olympus" }));
});

test("the scheduler fires at 05:00 in the configured timezone and reports its next run", () => {
  assert.equal(startStremioAutoSync({ enabled: false, cron: "0 5 * * *", timezone: "America/Toronto" }), null);
  assert.deepEqual(getStremioAutoSyncStatus(), {
    enabled: false,
    timezone: "America/Toronto",
    nextRunAt: null,
  });

  const job = startStremioAutoSync({ enabled: true, cron: "0 5 * * *", timezone: "America/Toronto" });
  try {
    assert.ok(job);
    const runs = job.nextRuns(3);
    for (const run of runs) {
      const local = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Toronto",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(run);
      assert.equal(local, "05:00");
    }
    const status = getStremioAutoSyncStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.nextRunAt, runs[0].toISOString());
  } finally {
    stopStremioAutoSync();
  }
});

test("integration routes report auto-sync status and a 409 for a sync in progress", async () => {
  const userId = await seedIntegration();
  const nextRunAt = "2026-11-19T10:00:00.000Z";
  const router = createIntegrationRouter({
    lifecycleService: {
      listForUser: async () => [],
      connect: async () => {
        throw new Error("unused");
      },
      disconnect: async () => {
        throw new Error("unused");
      },
      markReauthRequired: async () => false,
    },
    pipelineService: {
      async syncCurrentStremioIntegration(_userId, options) {
        assert.equal(options?.trigger, "manual");
        throw new StremioPipelineError("stremio_sync_in_progress");
      },
    },
    autoSyncStatus: () => ({ enabled: true, timezone: "America/Toronto", nextRunAt }),
  });
  const routeHandler = (path: string, method: string) => {
    const layer = (router as any).stack.find(
      (entry: any) => entry.route?.path === path && entry.route.methods[method]
    );
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  };
  const response = () => {
    const state: { statusCode: number; body?: any } = { statusCode: 200 };
    return {
      state,
      status(code: number) {
        state.statusCode = code;
        return this;
      },
      json(body: any) {
        state.body = body;
        return this;
      },
    };
  };

  const list = response();
  await routeHandler("/", "get")({ user: { id: userId }, body: {} }, list);
  assert.deepEqual(list.state.body.autoSync, {
    enabled: true,
    timezone: "America/Toronto",
    nextRunAt,
  });

  const sync = response();
  await routeHandler("/stremio/sync", "post")({ user: { id: userId }, body: {} }, sync);
  assert.equal(sync.state.statusCode, 409);
  assert.equal(sync.state.body.code, "stremio_sync_in_progress");
});
