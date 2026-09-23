import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import Movie from "../models/movie";
import UserIntegration from "../models/UserIntegration";
import { createStremioMovieMatchService } from "../services/integrations/stremioMovieMatchService";
import {
  ResolvedTmdbMovie,
  TmdbMovieResolver,
  TmdbMovieResolverError,
} from "../services/integrations/tmdbMovieResolver";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_stremio_match_test");
  await UserIntegration.syncIndexes();
  await IntegrationMediaState.syncIndexes();
  await Movie.syncIndexes();
});

afterEach(async () => {
  await Promise.all([
    UserIntegration.deleteMany({}),
    IntegrationMediaState.deleteMany({}),
    Movie.deleteMany({}),
  ]);
});

after(async () => {
  await testMongo.stop();
});

const fakeCredentialEnvelope = {
  ciphertext: "fake-ciphertext",
  iv: "fake-iv",
  authTag: "fake-auth-tag",
  keyVersion: 1,
};

const resolvedMovie: ResolvedTmdbMovie = {
  tmdbId: 329865,
  title: "Arrival",
  posterPath: "/arrival.jpg",
  voteAverage: 7.6,
};

const createIntegration = (userId = new mongoose.Types.ObjectId(), credentialVersion = 2) =>
  UserIntegration.create({
    userId,
    provider: "stremio",
    status: "connected",
    credentialEnvelope: fakeCredentialEnvelope,
    credentialVersion,
  });

const createState = (
  integrationId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) =>
  IntegrationMediaState.create({
    integrationId,
    providerMediaType: "movie",
    providerItemId: "tt2543164",
    identifierNamespace: "imdb",
    observedCredentialVersion: 2,
    providerRevision: "provider-revision",
    providerLastWatchedAt: new Date("2026-01-01T00:00:00.000Z"),
    completed: true,
    removed: false,
    lastSeenAt: new Date("2026-01-02T00:00:00.000Z"),
    timestampConfidence: "provider_last_watched",
    matchStatus: "unresolved",
    importStatus: "pending",
    ...overrides,
  });

const resolver = (
  resolveByImdbId: TmdbMovieResolver["resolveByImdbId"]
): TmdbMovieResolver => ({ resolveByImdbId });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("matcher uses only current completed movie states and handles unsupported identifiers locally", async () => {
  const integration = await createIntegration();
  await createState(integration._id, { removed: true });
  const incomplete = await createState(integration._id, {
    providerItemId: "tt1111111",
    completed: false,
  });
  const oldGeneration = await createState(integration._id, {
    providerItemId: "tt2222222",
    observedCredentialVersion: 1,
  });
  const unsupported = await createState(integration._id, {
    providerItemId: "provider-item",
    identifierNamespace: "provider",
  });
  let tmdbRequests = 0;
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => {
      tmdbRequests += 1;
      return resolvedMovie;
    }),
  });

  const summary = await service.matchCurrentStremioMovies(integration.userId.toString());
  assert.deepEqual(summary, {
    examined: 2,
    matched: 1,
    movieMissing: 0,
    unsupported: 1,
    retryableErrors: 0,
    skippedStale: 0,
  });
  assert.equal(tmdbRequests, 1);
  assert.equal((await IntegrationMediaState.findById(incomplete._id))?.matchStatus, "unresolved");
  assert.equal((await IntegrationMediaState.findById(oldGeneration._id))?.matchStatus, "unresolved");
  assert.equal((await IntegrationMediaState.findById(unsupported._id))?.matchStatus, "unsupported_identifier");
});

test("zero result becomes stable movie_missing and an already matched state is idempotent", async () => {
  const integration = await createIntegration();
  const state = await createState(integration._id);
  let requests = 0;
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => {
      requests += 1;
      return null;
    }),
  });
  const first = await service.matchCurrentStremioMovies(integration.userId.toString());
  const second = await service.matchCurrentStremioMovies(integration.userId.toString());
  assert.equal(first.movieMissing, 1);
  assert.equal(second.examined, 0);
  assert.equal(requests, 1);
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(stored?.matchStatus, "movie_missing");
  assert.equal(stored?.matchedMovieId, undefined);
  assert.equal(stored?.matchedTmdbId, undefined);
});

test("success creates canonical TMDB identity and preserves provider/import fields", async () => {
  const integration = await createIntegration();
  const importedHistoryEntryId = new mongoose.Types.ObjectId();
  const importedAt = new Date("2026-01-03T00:00:00.000Z");
  const state = await createState(integration._id, {
    importStatus: "suppressed",
    importedHistoryEntryId,
    importedAt,
    suppressionReason: "user_suppressed",
    lastErrorCode: "old_error",
  });
  const before = state.toObject();
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => resolvedMovie),
  });
  assert.equal((await service.matchCurrentStremioMovies(integration.userId.toString())).matched, 1);

  const movie = await Movie.findOne({ imdbID: "tmdb-329865" });
  const stored = await IntegrationMediaState.findById(state._id);
  assert.ok(movie);
  assert.equal(movie?.title, "Arrival");
  assert.equal(movie?.addedBy?.toString(), integration.userId.toString());
  assert.equal(stored?.matchStatus, "matched");
  assert.equal(stored?.matchedTmdbId, 329865);
  assert.equal(stored?.matchedMovieId?.toString(), movie?._id.toString());
  assert.equal(stored?.lastErrorCode, undefined);
  for (const field of [
    "providerRevision",
    "providerLastWatchedAt",
    "completed",
    "removed",
    "lastSeenAt",
    "timestampConfidence",
    "observedCredentialVersion",
    "importStatus",
    "importedHistoryEntryId",
    "importedAt",
    "suppressionReason",
  ] as const) {
    assert.deepEqual(stored?.get(field), before[field]);
  }
});

test("existing canonical Movie is reused without replacing ownership or metadata", async () => {
  const originalOwner = new mongoose.Types.ObjectId();
  const existing = await Movie.create({
    imdbID: "tmdb-329865",
    title: "Existing title",
    poster: "/existing.jpg",
    vote_average: 9.1,
    addedBy: originalOwner,
  });
  const integration = await createIntegration();
  const state = await createState(integration._id);
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => resolvedMovie),
  });
  await service.matchCurrentStremioMovies(integration.userId.toString());

  const storedMovie = await Movie.findById(existing._id);
  const storedState = await IntegrationMediaState.findById(state._id);
  assert.equal(await Movie.countDocuments({ imdbID: "tmdb-329865" }), 1);
  assert.equal(storedMovie?.title, "Existing title");
  assert.equal(storedMovie?.poster, "/existing.jpg");
  assert.equal(storedMovie?.addedBy?.toString(), originalOwner.toString());
  assert.equal(storedState?.matchedMovieId?.toString(), existing._id.toString());
});

test("two concurrent matchers converge on one canonical Movie", async () => {
  const first = await createIntegration();
  const second = await createIntegration();
  await createState(first._id);
  await createState(second._id);
  const gate = deferred<void>();
  let arrivals = 0;
  const sharedResolver = resolver(async () => {
    arrivals += 1;
    if (arrivals === 2) gate.resolve();
    await gate.promise;
    return resolvedMovie;
  });
  const service = createStremioMovieMatchService({ resolver: sharedResolver });
  const [firstResult, secondResult] = await Promise.all([
    service.matchCurrentStremioMovies(first.userId.toString()),
    service.matchCurrentStremioMovies(second.userId.toString()),
  ]);

  assert.equal(firstResult.matched, 1);
  assert.equal(secondResult.matched, 1);
  assert.equal(await Movie.countDocuments({ imdbID: "tmdb-329865" }), 1);
  const states = await IntegrationMediaState.find({ matchStatus: "matched" });
  assert.equal(states.length, 2);
  assert.equal(states[0].matchedMovieId?.toString(), states[1].matchedMovieId?.toString());
});

test("resolver failures become sanitized retryable states and can later converge", async () => {
  const integration = await createIntegration();
  const state = await createState(integration._id, {
    matchedMovieId: new mongoose.Types.ObjectId(),
    matchedTmdbId: 10,
  });
  const failing = createStremioMovieMatchService({
    resolver: resolver(async () => {
      throw new TmdbMovieResolverError("tmdb_ambiguous_match");
    }),
  });
  assert.equal((await failing.matchCurrentStremioMovies(integration.userId.toString())).retryableErrors, 1);
  let stored = await IntegrationMediaState.findById(state._id);
  assert.equal(stored?.matchStatus, "retryable_error");
  assert.equal(stored?.lastErrorCode, "tmdb_ambiguous_match");
  assert.equal(stored?.matchedMovieId, undefined);
  assert.equal(stored?.matchedTmdbId, undefined);
  assert.equal(
    (await failing.matchCurrentStremioMovies(integration.userId.toString())).retryableErrors,
    1
  );

  const succeeding = createStremioMovieMatchService({
    resolver: resolver(async () => resolvedMovie),
  });
  assert.equal((await succeeding.matchCurrentStremioMovies(integration.userId.toString())).matched, 1);
  stored = await IntegrationMediaState.findById(state._id);
  assert.equal(stored?.matchStatus, "matched");
  assert.equal(stored?.lastErrorCode, undefined);
});

test("reconnect during TMDB lookup prevents stale Movie creation and state writes", async () => {
  const integration = await createIntegration();
  const state = await createState(integration._id);
  const lookup = deferred<ResolvedTmdbMovie | null>();
  const started = deferred<void>();
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => {
      started.resolve();
      return lookup.promise;
    }),
  });
  const running = service.matchCurrentStremioMovies(integration.userId.toString());
  await started.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    { $inc: { credentialVersion: 1 } }
  );
  await IntegrationMediaState.updateOne(
    { _id: state._id },
    { $set: { observedCredentialVersion: 3 } }
  );
  lookup.resolve(resolvedMovie);

  const summary = await running;
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(summary.skippedStale, 1);
  assert.equal(await Movie.countDocuments(), 0);
  assert.equal(stored?.observedCredentialVersion, 3);
  assert.equal(stored?.matchStatus, "unresolved");
});

test("state generation advance during TMDB lookup cannot be overwritten", async () => {
  const integration = await createIntegration();
  const state = await createState(integration._id);
  const lookup = deferred<ResolvedTmdbMovie | null>();
  const started = deferred<void>();
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => {
      started.resolve();
      return lookup.promise;
    }),
  });
  const running = service.matchCurrentStremioMovies(integration.userId.toString());
  await started.promise;
  await IntegrationMediaState.updateOne(
    { _id: state._id },
    { $set: { observedCredentialVersion: 3, providerRevision: "new-generation" } }
  );
  lookup.resolve(resolvedMovie);

  const summary = await running;
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(summary.skippedStale, 1);
  assert.equal(stored?.observedCredentialVersion, 3);
  assert.equal(stored?.providerRevision, "new-generation");
  assert.equal(stored?.matchStatus, "unresolved");
});

test("already matched state causes no request or duplicate Movie on rerun", async () => {
  const integration = await createIntegration();
  const movie = await Movie.create({
    imdbID: "tmdb-329865",
    title: "Arrival",
    vote_average: 7.6,
    addedBy: integration.userId,
  });
  await createState(integration._id, {
    matchStatus: "matched",
    matchedMovieId: movie._id,
    matchedTmdbId: 329865,
  });
  let requests = 0;
  const service = createStremioMovieMatchService({
    resolver: resolver(async () => {
      requests += 1;
      return resolvedMovie;
    }),
  });
  const summary = await service.matchCurrentStremioMovies(integration.userId.toString());
  assert.equal(summary.examined, 0);
  assert.equal(requests, 0);
  assert.equal(await Movie.countDocuments(), 1);
});
