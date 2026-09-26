import assert from "node:assert/strict";
import { test } from "node:test";
import { StremioClientError } from "../services/integrations/stremioClient";
import {
  createStremioPipelineService,
  StremioPipelineError,
} from "../services/integrations/stremioPipelineService";
import { StremioSyncError } from "../services/integrations/stremioSyncService";

const userId = "64b64b64b64b64b64b64b64b";
const snapshot = {
  status: "success" as const,
  integrationId: "74b64b64b64b64b64b64b64b",
  credentialVersion: 7,
  snapshotItems: 6,
  movieStates: 5,
  ignoredItems: 1,
  observed: 5,
  upserted: 4,
  matched: 1,
  modified: 1,
};
const alwaysCurrent = { isCurrent: async () => true };
const alwaysFinalizes = {
  completeSuccess: async () => true,
  completeFailure: async () => true,
};
const matching = {
  examined: 5,
  matched: 2,
  movieMissing: 1,
  unsupported: 1,
  retryableErrors: 1,
  skippedStale: 0,
};
const importSummary = {
  examined: 3,
  imported: 2,
  alreadyImported: 0,
  timestampUnavailable: 1,
  invalidMatch: 0,
  skippedStale: 0,
};

test("pipeline calls snapshot, matching, and import in exact order", async () => {
  const calls: string[] = [];
  const service = createStremioPipelineService({
    snapshotService: {
      sync: async (value) => {
        assert.equal(value, userId);
        calls.push("snapshot");
        return snapshot;
      },
    },
    matchingService: {
      matchCurrentStremioMovies: async (value) => {
        assert.equal(value, userId);
        calls.push("match");
        return matching;
      },
    },
    importService: {
      importCurrentStremioMovies: async (value) => {
        assert.equal(value, userId);
        calls.push("import");
        return importSummary;
      },
    },
    generationService: {
      isCurrent: async (integrationId, credentialVersion) => {
        assert.equal(integrationId, snapshot.integrationId);
        assert.equal(credentialVersion, snapshot.credentialVersion);
        calls.push("verify");
        return true;
      },
    },
    lifecycleService: {
      completeSuccess: async (integrationId, credentialVersion) => {
        assert.equal(integrationId, snapshot.integrationId);
        assert.equal(credentialVersion, snapshot.credentialVersion);
        calls.push("finalize-success");
        return true;
      },
      completeFailure: async () => {
        throw new Error("must not fail");
      },
    },
  });

  const result = await service.syncCurrentStremioIntegration(userId);
  assert.deepEqual(calls, [
    "snapshot",
    "verify",
    "match",
    "verify",
    "import",
    "verify",
    "finalize-success",
  ]);
  assert.deepEqual(result, {
    provider: "stremio",
    status: "success",
    snapshot: {
      snapshotItems: 6,
      movieStates: 5,
      ignoredItems: 1,
      observed: 5,
      upserted: 4,
      matched: 1,
      modified: 1,
    },
    matching,
    import: importSummary,
  });
  assert.equal(
    /credentialVersion|integrationId|credential|authKey|password|raw/i.test(
      JSON.stringify(result)
    ),
    false
  );
});

test("item-level matching and timestamp outcomes still complete successfully", async () => {
  let importCalled = false;
  const service = createStremioPipelineService({
    snapshotService: { sync: async () => snapshot },
    matchingService: { matchCurrentStremioMovies: async () => matching },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        return importSummary;
      },
    },
    generationService: alwaysCurrent,
    lifecycleService: alwaysFinalizes,
  });

  const result = await service.syncCurrentStremioIntegration(userId);
  assert.equal(importCalled, true);
  assert.equal(result.status, "success");
  assert.equal(result.matching.movieMissing, 1);
  assert.equal(result.matching.unsupported, 1);
  assert.equal(result.matching.retryableErrors, 1);
  assert.equal(result.import.timestampUnavailable, 1);
});

test("snapshot failures stop matching and import and expose only stable codes", async () => {
  const cases: Array<[unknown, StremioPipelineError["code"]]> = [
    [new StremioSyncError("integration_not_connected"), "stremio_not_connected"],
    [new StremioSyncError("integration_reauth_required"), "stremio_reauth_required"],
    [new StremioSyncError("integration_changed"), "integration_changed"],
    [new StremioSyncError("credential_decryption_failed"), "stremio_sync_failed"],
    [new StremioClientError("invalid_session"), "stremio_reauth_required"],
    [new StremioClientError("network_error"), "stremio_provider_unavailable"],
    [new StremioClientError("provider_unavailable"), "stremio_provider_unavailable"],
    [new Error("sensitive database detail"), "stremio_sync_failed"],
  ];

  for (const [failure, expectedCode] of cases) {
    let matchingCalled = false;
    let importCalled = false;
    const service = createStremioPipelineService({
      snapshotService: { sync: async () => { throw failure; } },
      matchingService: {
        matchCurrentStremioMovies: async () => {
          matchingCalled = true;
          return matching;
        },
      },
      importService: {
        importCurrentStremioMovies: async () => {
          importCalled = true;
          return importSummary;
        },
      },
      generationService: alwaysCurrent,
      lifecycleService: alwaysFinalizes,
    });

    await assert.rejects(
      service.syncCurrentStremioIntegration(userId),
      (error: unknown) =>
        error instanceof StremioPipelineError && error.code === expectedCode
    );
    assert.equal(matchingCalled, false);
    assert.equal(importCalled, false);
  }
});

test("fatal matching failure prevents import and fatal import failure is sanitized", async () => {
  let importCalled = false;
  const failures: string[] = [];
  const lifecycleService = {
    completeSuccess: async () => true,
    completeFailure: async (
      integrationId: string,
      credentialVersion: number,
      _completedAt: Date,
      errorCode: string
    ) => {
      assert.equal(integrationId, snapshot.integrationId);
      assert.equal(credentialVersion, snapshot.credentialVersion);
      failures.push(errorCode);
      return true;
    },
  };
  const matchingFailure = createStremioPipelineService({
    snapshotService: { sync: async () => snapshot },
    matchingService: { matchCurrentStremioMovies: async () => { throw new Error("db"); } },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        return importSummary;
      },
    },
    generationService: alwaysCurrent,
    lifecycleService,
  });
  await assert.rejects(
    matchingFailure.syncCurrentStremioIntegration(userId),
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "stremio_sync_failed"
  );
  assert.equal(importCalled, false);
  assert.deepEqual(failures, ["stremio_sync_failed"]);

  const importFailure = createStremioPipelineService({
    snapshotService: { sync: async () => snapshot },
    matchingService: { matchCurrentStremioMovies: async () => matching },
    importService: { importCurrentStremioMovies: async () => { throw new Error("db"); } },
    generationService: alwaysCurrent,
    lifecycleService,
  });
  await assert.rejects(
    importFailure.syncCurrentStremioIntegration(userId),
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "stremio_sync_failed"
  );
  assert.deepEqual(failures, ["stremio_sync_failed", "stremio_sync_failed"]);
});

test("generation change between stages stops before the next stage", async () => {
  let checks = 0;
  let importCalled = false;
  const service = createStremioPipelineService({
    snapshotService: { sync: async () => snapshot },
    matchingService: { matchCurrentStremioMovies: async () => matching },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        return importSummary;
      },
    },
    generationService: {
      isCurrent: async () => {
        checks += 1;
        return checks === 1;
      },
    },
    lifecycleService: alwaysFinalizes,
  });

  await assert.rejects(
    service.syncCurrentStremioIntegration(userId),
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "integration_changed"
  );
  assert.equal(importCalled, false);
});
