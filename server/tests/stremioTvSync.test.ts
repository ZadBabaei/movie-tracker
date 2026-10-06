import assert from "node:assert/strict";
import { before, after, afterEach, test } from "node:test";
import { Types } from "mongoose";
import { deflateSync } from "node:zlib";
import IntegrationMediaState from "../models/IntegrationMediaState";
import UserIntegration from "../models/UserIntegration";
import WatchHistoryEntry, { IWatchHistoryTvEpisode } from "../models/WatchHistoryEntry";
import { createStremioHistoryImportService, suppressStremioImportAfterHistoryDelete } from "../services/integrations/stremioHistoryImportService";
import { createStremioMovieMatchService } from "../services/integrations/stremioMovieMatchService";
import { ingestStremioMovieStates, createStremioSyncService } from "../services/integrations/stremioSyncService";
import { createStremioPipelineService } from "../services/integrations/stremioPipelineService";
import { normalizeStremioTvEpisodes } from "../services/integrations/stremioSnapshot";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let mongo: IsolatedTestMongo;
before(async () => {
  mongo = await startIsolatedTestMongo("movie_tracker_stremio_tv_test");
  await Promise.all([IntegrationMediaState.syncIndexes(), UserIntegration.syncIndexes(), WatchHistoryEntry.syncIndexes()]);
});
afterEach(async () => { await Promise.all([IntegrationMediaState.deleteMany({}), UserIntegration.deleteMany({}), WatchHistoryEntry.deleteMany({})]); });
after(async () => { await mongo.stop(); });

const date = new Date("2026-08-30T12:00:00Z");
const tv = (episodeNumber = 3): IWatchHistoryTvEpisode => ({ seriesTmdbId: 113962, seasonNumber: 1, episodeNumber, episodeTmdbId: 100 + episodeNumber, seriesTitle: "Lioness", episodeTitle: `Episode ${episodeNumber}`, posterPath: "/poster", backdropPath: "/backdrop", stillPath: "/still", airDate: new Date("2023-08-01T00:00:00Z") });
const integration = () => UserIntegration.create({ userId: new Types.ObjectId(), provider: "stremio", status: "connected", credentialVersion: 2, credentialEnvelope: { ciphertext: "fake", iv: "fake", authTag: "fake", keyVersion: 1 } });
const state = (integrationId: Types.ObjectId, episodeNumber = 3, overrides: Record<string, unknown> = {}) => IntegrationMediaState.create({
  integrationId, providerMediaType: "tv_episode", providerItemId: `tt13111078:1:${episodeNumber}`, identifierNamespace: "imdb", providerSeriesImdbId: "tt13111078", seasonNumber: 1, episodeNumber,
  observedCredentialVersion: 2, providerLastWatchedAt: date, completed: true, removed: false, lastSeenAt: date,
  matchStatus: "matched", matchedTv: tv(episodeNumber), importStatus: "pending", timestampConfidence: "observed_at", ...overrides,
});

test("TV concurrent and repeated imports share one reservation and preserve complete server metadata", async () => {
  const owner = await integration();
  const source = await state(owner._id);
  const importer = createStremioHistoryImportService();
  await Promise.all([importer.importCurrentStremioMovies(String(owner.userId)), importer.importCurrentStremioMovies(String(owner.userId))]);
  await importer.importCurrentStremioMovies(String(owner.userId));
  const entries = await WatchHistoryEntry.find({ createdBy: owner.userId }).select("+integrationMediaStateId");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].mediaType, "tv_episode");
  assert.equal(entries[0].movieId, undefined);
  assert.equal(entries[0].tv?.episodeTmdbId, 103);
  assert.equal(entries[0].tv?.stillPath, "/still");
  assert.equal(entries[0].watchedAt.toISOString(), date.toISOString());
  assert.equal(String(entries[0].integrationMediaStateId), String(source._id));
});

test("TV manual episode on an earlier date suppresses only that episode without altering metadata", async () => {
  const owner = await integration();
  const duplicate = await state(owner._id, 3);
  await state(owner._id, 4);
  const manual = await WatchHistoryEntry.create({ mediaType: "tv_episode", tv: tv(), scope: "personal", createdBy: owner.userId, participants: [owner.userId], watchedAt: new Date("2026-01-01T00:00:00Z"), watchedNotes: "Keep", watchedLocation: "Home", ratings: [{ userId: owner.userId, rating: 8 }] });
  const before = manual.toObject();
  const result = await createStremioHistoryImportService().importCurrentStremioMovies(String(owner.userId));
  assert.equal(result.duplicatesDetected, 1);
  assert.equal(result.tvEpisodesImported, 1);
  assert.equal(await WatchHistoryEntry.countDocuments(), 2);
  assert.deepEqual((await WatchHistoryEntry.findById(manual._id))!.toObject(), before);
  assert.equal((await IntegrationMediaState.findById(duplicate._id))?.suppressionReason, "equivalent_local_history");
  await WatchHistoryEntry.deleteOne({ _id: manual._id });
  await createStremioHistoryImportService().importCurrentStremioMovies(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments({ "tv.episodeNumber": 3 }), 0);
});

test("TV known distinct occurrence allows rewatch; another account's episode never suppresses import", async () => {
  const owner = await integration();
  const other = new Types.ObjectId();
  await state(owner._id, 3, { timestampConfidence: "provider_last_watched" });
  for (const [createdBy, watchedAt] of [[owner.userId, new Date("2026-01-01T00:00:00Z")], [other, date]] as const) {
    await WatchHistoryEntry.create({ mediaType: "tv_episode", tv: tv(), scope: "personal", createdBy, participants: [createdBy], watchedAt });
  }
  await createStremioHistoryImportService().importCurrentStremioMovies(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: owner.userId }), 2);
  assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: other }), 1);
});

test("TV imported deletion remains suppressed on repeated syncs", async () => {
  const owner = await integration();
  const source = await state(owner._id);
  const importer = createStremioHistoryImportService();
  await importer.importCurrentStremioMovies(String(owner.userId));
  const entry = (await WatchHistoryEntry.findOne({ createdBy: owner.userId }).select("+integrationMediaStateId"))!;
  assert.equal(await suppressStremioImportAfterHistoryDelete(entry), true);
  await WatchHistoryEntry.deleteOne({ _id: entry._id });
  await importer.importCurrentStremioMovies(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
  assert.equal((await IntegrationMediaState.findById(source._id))?.suppressionReason, "local_history_deleted");
});

test("TV interrupted reservation recovers; reconnect during finalization removes stale history", async () => {
  const owner = await integration();
  const source = await state(owner._id, 3, { importedHistoryEntryId: new Types.ObjectId(), importReservationCredentialVersion: 2 });
  await createStremioHistoryImportService({ beforeFinalize: async () => { await UserIntegration.updateOne({ _id: owner._id }, { $inc: { credentialVersion: 1 } }); } }).importCurrentStremioMovies(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
  assert.equal((await IntegrationMediaState.findById(source._id))?.importStatus, "pending");
  await IntegrationMediaState.updateOne({ _id: source._id }, { $set: { observedCredentialVersion: 3 } });
  await createStremioHistoryImportService().importCurrentStremioMovies(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments(), 1);
});

test("TV matching uses canonical resolver with generation protection and retries external failures", async () => {
  const owner = await integration();
  const source = await state(owner._id, 3, { matchStatus: "unresolved", matchedTv: undefined });
  const result = await createStremioMovieMatchService({ tvResolver: { resolveEpisode: async () => tv() } }).matchCurrentStremioMovies(String(owner.userId));
  assert.equal(result.tvEpisodesMatched, 1);
  assert.equal((await IntegrationMediaState.findById(source._id))?.matchedTv?.seriesTmdbId, 113962);
  await state(owner._id, 4, { matchStatus: "unresolved", matchedTv: undefined });
  const failed = await createStremioMovieMatchService({ tvResolver: { resolveEpisode: async () => { throw new Error("failure"); } } }).matchCurrentStremioMovies(String(owner.userId));
  assert.equal(failed.retryableErrors, 1);
});

test("TV observed sync date is stable on later ingestion and only newly watched episode identities are added", async () => {
  const owner = await integration();
  const ids = Array.from({ length: 9 }, (_, index) => `tt2934286:1:${index + 1}`);
  const item = { id: "tt2934286", type: "series", removed: false, state: { watched: "tt2934286:1:5:5:eJyTZwAAAEAAIA==" } };
  await ingestStremioMovieStates(owner._id, normalizeStremioTvEpisodes(item, ids, date), date, 2);
  const later = new Date("2026-09-30T12:00:00Z");
  await ingestStremioMovieStates(owner._id, normalizeStremioTvEpisodes(item, ids, later), later, 2);
  const states = await IntegrationMediaState.find({ integrationId: owner._id });
  assert.equal(states.length, 5);
  assert.ok(states.every(row => row.providerLastWatchedAt?.getTime() === date.getTime()));
  await ingestStremioMovieStates(owner._id, normalizeStremioTvEpisodes(item, ids, later), later, 1);
  assert.ok((await IntegrationMediaState.find({ integrationId: owner._id })).every(row => row.observedCredentialVersion === 2));
});

test("full TV pipeline imports only new episodes between syncs and assigns each its own first sync date", async () => {
  const owner = await integration();
  const ids = [1, 2, 3].map(episode => `tt13111078:1:${episode}`);
  let currentDate = date;
  let watched = `${ids[1]}:2:${deflateSync(Buffer.from([3])).toString("base64")}`;
  await WatchHistoryEntry.create({ mediaType: "tv_episode", tv: tv(1), scope: "personal", createdBy: owner.userId, participants: [owner.userId], watchedAt: new Date("2026-01-01T00:00:00Z") });
  const pipeline = createStremioPipelineService({
    snapshotService: createStremioSyncService({
      cryptoService: { decryptCredential: () => "fake" }, now: () => currentDate,
      episodeCatalog: { getOrderedVideoIds: async () => ids },
      client: { getLibrarySnapshot: async () => [{ id: "tt13111078", type: "series", removed: false, state: { watched } }] },
    }),
    matchingService: createStremioMovieMatchService({ tvResolver: { resolveEpisode: async id => tv(Number(id.split(":")[2])) } }),
    importService: createStremioHistoryImportService(),
  });
  const first = await pipeline.syncCurrentStremioIntegration(String(owner.userId));
  assert.equal(first.import.duplicatesDetected, 1);
  assert.equal(first.import.tvEpisodesImported, 1);
  currentDate = new Date("2026-09-30T12:00:00Z");
  watched = `${ids[2]}:3:${deflateSync(Buffer.from([7])).toString("base64")}`;
  const second = await pipeline.syncCurrentStremioIntegration(String(owner.userId));
  assert.equal(second.import.tvEpisodesImported, 1);
  await pipeline.syncCurrentStremioIntegration(String(owner.userId));
  assert.equal(await WatchHistoryEntry.countDocuments(), 3);
  assert.equal((await WatchHistoryEntry.findOne({ "tv.episodeNumber": 2 }))?.watchedAt.getTime(), date.getTime());
  assert.equal((await WatchHistoryEntry.findOne({ "tv.episodeNumber": 3 }))?.watchedAt.getTime(), currentDate.getTime());
});

test("TV reserved history survives interrupted finalization and concurrent recovery without another row", async () => {
  const owner = await integration();
  const historyId = new Types.ObjectId();
  const source = await state(owner._id, 3, { importedHistoryEntryId: historyId, importReservationCredentialVersion: 2 });
  await WatchHistoryEntry.create({ _id: historyId, mediaType: "tv_episode", tv: tv(), scope: "personal", createdBy: owner.userId, participants: [owner.userId], watchedAt: date, integrationMediaStateId: source._id });
  const importer = createStremioHistoryImportService();
  await Promise.all([importer.importCurrentStremioMovies(String(owner.userId)), importer.importCurrentStremioMovies(String(owner.userId))]);
  assert.equal(await WatchHistoryEntry.countDocuments(), 1);
  assert.equal((await IntegrationMediaState.findById(source._id))?.importStatus, "imported");
});

test("TV matching classifies missing and unsupported identities, and cannot write after reconnect", async () => {
  const owner = await integration();
  const source = await state(owner._id, 1, { matchStatus: "unresolved", matchedTv: undefined });
  const missing = await createStremioMovieMatchService({ tvResolver: { resolveEpisode: async () => null } }).matchCurrentStremioMovies(String(owner.userId));
  assert.equal(missing.tvEpisodesMissing, 1);
  assert.equal((await IntegrationMediaState.findById(source._id))?.matchStatus, "tv_episode_missing");
  await state(owner._id, 2, { matchStatus: "unresolved", providerItemId: "bad", matchedTv: undefined });
  const unsupported = await createStremioMovieMatchService().matchCurrentStremioMovies(String(owner.userId));
  assert.equal(unsupported.unsupported, 1);
  const stale = await state(owner._id, 3, { matchStatus: "unresolved", matchedTv: undefined });
  const result = await createStremioMovieMatchService({ tvResolver: { resolveEpisode: async () => {
    await UserIntegration.updateOne({ _id: owner._id }, { $inc: { credentialVersion: 1 } });
    return tv();
  } } }).matchCurrentStremioMovies(String(owner.userId));
  assert.equal(result.skippedStale, 1);
  assert.equal((await IntegrationMediaState.findById(stale._id))?.matchStatus, "unresolved");
});
