import crypto from "node:crypto";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import Movie from "../models/movie";
import UserIntegration from "../models/UserIntegration";
import WatchHistoryEntry from "../models/WatchHistoryEntry";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");

const anonymousId = (value: unknown) =>
  crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

const idsEqual = (left: unknown, right: unknown) => String(left) === String(right);

const main = async () => {
  mongoose.set("autoIndex", false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });

  const [totalHistoryEntries, stremioEntries, duplicateLinks] = await Promise.all([
    WatchHistoryEntry.countDocuments({}),
    WatchHistoryEntry.find({ integrationMediaStateId: { $exists: true } })
      .select("_id scope groupId createdBy participants movieId watchedAt +integrationMediaStateId")
      .lean(),
    WatchHistoryEntry.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { integrationMediaStateId: { $exists: true } } },
      { $group: { _id: "$integrationMediaStateId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]),
  ]);

  const stateIds = stremioEntries.map((entry) => entry.integrationMediaStateId!);
  const states = await IntegrationMediaState.find({ _id: { $in: stateIds } })
    .select("_id integrationId importStatus providerLastWatchedAt matchedMovieId")
    .lean();
  const integrations = await UserIntegration.find({
    _id: { $in: states.map((state) => state.integrationId) },
  }).select("_id userId").lean();
  const stateById = new Map(states.map((state) => [String(state._id), state]));
  const integrationById = new Map(integrations.map((integration) => [String(integration._id), integration]));

  const mismatches: Array<{ entry: string; state: string; reasons: string[] }> = [];
  const affectedUsers = new Set<string>();
  for (const entry of stremioEntries) {
    const state = stateById.get(String(entry.integrationMediaStateId));
    const integration = state ? integrationById.get(String(state.integrationId)) : undefined;
    const reasons: string[] = [];
    if (!state) reasons.push("missing_media_state");
    if (state && !integration) reasons.push("missing_user_integration");
    if (integration) {
      const ownerId = integration.userId;
      if (!idsEqual(entry.createdBy, ownerId)) reasons.push("created_by_owner_mismatch");
      if (entry.participants.length !== 1 || !idsEqual(entry.participants[0], ownerId)) {
        reasons.push("participants_owner_mismatch");
      }
      if (entry.scope !== "personal") reasons.push("non_personal_scope");
      if (entry.groupId) reasons.push("unexpected_group_id");
      if (reasons.length) affectedUsers.add(anonymousId(ownerId));
    }
    if (reasons.length) {
      mismatches.push({
        entry: anonymousId(entry._id),
        state: anonymousId(entry.integrationMediaStateId),
        reasons,
      });
    }
  }

  const importedByEvent = new Map<string, typeof stremioEntries>();
  for (const entry of stremioEntries) {
    const key = [entry.createdBy, entry.movieId, entry.watchedAt?.toISOString()].map(String).join(":");
    importedByEvent.set(key, [...(importedByEvent.get(key) || []), entry]);
  }
  const manualEntries = await WatchHistoryEntry.find({
    integrationMediaStateId: { $exists: false },
    scope: "personal",
    movieId: { $exists: true },
  }).select("_id createdBy movieId watchedAt").lean();
  const manualStremioCandidates = manualEntries.filter((entry) => {
    const key = [entry.createdBy, entry.movieId, entry.watchedAt?.toISOString()].map(String).join(":");
    return importedByEvent.has(key);
  });
  const candidateUsers = new Set(manualStremioCandidates.map((entry) => anonymousId(entry.createdBy)));

  const repeatedImportedMovieGroups = [...stremioEntries.reduce((groups, entry) => {
    const key = [entry.createdBy, entry.movieId].map(String).join(":");
    groups.set(key, (groups.get(key) || 0) + 1);
    return groups;
  }, new Map<string, number>()).values()].filter((count) => count > 1);
  const exactImportedEventGroups = [...stremioEntries.reduce((groups, entry) => {
    const key = [entry.createdBy, entry.movieId, entry.watchedAt?.toISOString()].map(String).join(":");
    groups.set(key, (groups.get(key) || 0) + 1);
    return groups;
  }, new Map<string, number>()).values()].filter((count) => count > 1);

  const allEntries = await WatchHistoryEntry.find({ movieId: { $exists: true } })
    .select("_id scope createdBy participants movieId watchedAt +integrationMediaStateId")
    .lean();
  const userMovieScopes = new Map<string, Set<string>>();
  for (const entry of allEntries) {
    for (const participant of entry.participants) {
      const key = `${participant}:${entry.movieId}`;
      const scopes = userMovieScopes.get(key) || new Set<string>();
      scopes.add(entry.scope);
      userMovieScopes.set(key, scopes);
    }
  }
  const personalAndGroupMovieGroups = [...userMovieScopes.values()]
    .filter((scopes) => scopes.has("personal") && scopes.has("group")).length;

  const investigatedTitles = ["Eyes Wide Shut", "The End of Oak Street"];
  const investigatedMovies = await Movie.find({ title: { $in: investigatedTitles } })
    .select("_id title")
    .lean();
  const namedTitleEvidence = Object.fromEntries(investigatedTitles.map((title) => {
    const movieIds = new Set(
      investigatedMovies.filter((movie) => movie.title === title).map((movie) => String(movie._id))
    );
    const entries = allEntries.filter((entry) => movieIds.has(String(entry.movieId)));
    return [title, {
      movieDocuments: movieIds.size,
      historyEntries: entries.length,
      stremioEntries: entries.filter((entry) => Boolean(entry.integrationMediaStateId)).length,
      manualEntries: entries.filter((entry) => !entry.integrationMediaStateId).length,
      personalEntries: entries.filter((entry) => entry.scope === "personal").length,
      groupEntries: entries.filter((entry) => entry.scope === "group").length,
      distinctOwners: new Set(entries.map((entry) => anonymousId(entry.createdBy))).size,
    }];
  }));

  const report = {
    mode: "read_only",
    totalWatchHistoryEntries: totalHistoryEntries,
    stremioProvenanceEntries: stremioEntries.length,
    ownershipProvenanceMismatches: mismatches.length,
    ownershipMismatchAffectedUsers: affectedUsers.size,
    exactDuplicateIntegrationMediaStateLinks: duplicateLinks.length,
    exactDuplicateIntegrationMediaStateLinkedEntries: duplicateLinks.reduce(
      (total, duplicate) => total + duplicate.count,
      0
    ),
    suspectedExactTimestampManualStremioEvents: manualStremioCandidates.length,
    suspectedManualStremioAffectedUsers: candidateUsers.size,
    repeatedStremioSameUserMovieGroups: repeatedImportedMovieGroups.length,
    repeatedStremioSameUserMovieEntries: repeatedImportedMovieGroups.reduce((sum, count) => sum + count, 0),
    exactTimestampStremioCollisionGroups: exactImportedEventGroups.length,
    personalAndGroupSameParticipantMovieGroups: personalAndGroupMovieGroups,
    namedTitleEvidence,
    mismatchSamples: mismatches.slice(0, 20),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`Ownership audit failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
