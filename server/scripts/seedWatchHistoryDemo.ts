import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import Group from "../models/Groups";
import Movie, { IMovie } from "../models/movie";
import User from "../models/user";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import { syncLegacyGroupHistory } from "../utils/watchHistory";

dotenv.config();

const uri = process.env.MONGODB_URI || "";
const databaseName = (() => {
  try {
    return new URL(uri.replace(/^mongodb\+srv:/, "mongodb:")).pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
})();

if (!uri) throw new Error("MONGODB_URI is required.");
if (!/(staging|stage|test|e2e)/i.test(databaseName)) {
  throw new Error(`Refusing to seed non-staging database "${databaseName || "unknown"}".`);
}

const reviewEmail = "history.review.20260901@staging.movietrk.com";
const seedNotePrefix = "Demo seed:";
const demoMembers = [
  { name: "Alex Morgan", email: "alex.demo@staging.movietrk.com", avatar: "https://api.dicebear.com/9.x/initials/svg?seed=Alex%20Morgan" },
  { name: "Maya Chen", email: "maya.demo@staging.movietrk.com", avatar: "https://api.dicebear.com/9.x/initials/svg?seed=Maya%20Chen" },
  { name: "Noah Williams", email: "noah.demo@staging.movietrk.com", avatar: "https://api.dicebear.com/9.x/initials/svg?seed=Noah%20Williams" },
  { name: "Sofia Patel", email: "sofia.demo@staging.movietrk.com", avatar: "https://api.dicebear.com/9.x/initials/svg?seed=Sofia%20Patel" },
  { name: "Ethan Brooks", email: "ethan.demo@staging.movietrk.com", avatar: "https://api.dicebear.com/9.x/initials/svg?seed=Ethan%20Brooks" },
];

const movieCatalog = [
  ["Oppenheimer", "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", 8.6],
  ["Dune: Part Two", "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", 8.5],
  ["Past Lives", "/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg", 8.0],
  ["The Grand Budapest Hotel", "/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg", 8.1],
  ["Spider-Man: Into the Spider-Verse", "/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg", 8.4],
  ["The Holdovers", "/VHSzNBTwxV8vh7wylo7O9CLdac.jpg", 7.9],
  ["Everything Everywhere All at Once", "/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg", 7.8],
  ["Parasite", "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", 8.5],
  ["Interstellar", "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", 8.7],
  ["Arrival", "/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg", 7.6],
  ["Blade Runner 2049", "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", 8.0],
  ["The Batman", "/74xTEgt7R36Fpooo50r9T25onhq.jpg", 7.7],
  ["Knives Out", "/pThyQovXQrw2m0s9x82twj48Jq4.jpg", 7.8],
  ["The Menu", "/v31MsWhF9WFh7Qooq6xSBbmJxoG.jpg", 7.2],
  ["La La Land", "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", 7.9],
  ["Whiplash", "/7fn624j5lj3xTme2SgiLCeuedmO.jpg", 8.4],
  ["The Social Network", "/n0ybibhJtQ5icDqTp8eRytcIHJx.jpg", 7.4],
  ["Get Out", "/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg", 7.6],
  ["The Green Knight", "/if4hw3Ou5Sav9Em7WWHj66mnywp.jpg", 6.6],
  ["Little Women", "/yn5ihODtZ7ofn8pDYfxCmxh8AXI.jpg", 7.9],
  ["The Banshees of Inisherin", "/4yFG6cSPaCaPhyJ1vtGOtMD1lgh.jpg", 7.5],
  ["Nope", "/AcKVlWaNVVVFQwro3nLXqPljcYA.jpg", 6.9],
  ["The Northman", "/aSSJMnHknzKjlZ6zybwD7eyJ4Po.jpg", 7.1],
  ["Aftersun", "/jeXmhP2zbUkREMRqFOYIwQOk49T.jpg", 7.7],
  ["The Worst Person in the World", "/p5nLFV9aaQ6ua6c2h4X80f9HLzN.jpg", 7.5],
  ["The Wild Robot", "/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg", 8.3],
  ["Anatomy of a Fall", "/kQs6keheMwCxJxrzV83VUwFtHkB.jpg", 7.7],
  ["Poor Things", "/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg", 7.7],
  ["The Zone of Interest", "/hUu9zyZmDd8VZegKi1iK1Vk0RYS.jpg", 7.1],
  ["The Boy and the Heron", "/f4oZTcfGrVTXKTWg157AwikXqmP.jpg", 7.5],
  ["Decision to Leave", "/N0l4pTQqga3Qk2OlSmuSM2NMYc.jpg", 7.4],
  ["Portrait of a Lady on Fire", "/2LquGwEhbg3soxSCs9VNyh5VJd9.jpg", 8.1],
  ["The Lighthouse", "/3nk9UoepYmv1G9oP18q6JJCeYwN.jpg", 7.5],
  ["Moonlight", "/qAwFbszz0kRyTuXmMeKQZCX3Q2O.jpg", 7.4],
  ["Lady Bird", "/gl66K7zRdtNYGrxyS2YDUP5ASZd.jpg", 7.3],
  ["Her", "/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg", 7.9],
  ["The Farewell", "/7ht2IMGynDSVQGvAXhAb83DLET8.jpg", 7.4],
  ["Minari", "/9Bb6K6HINl3vEKCu8WXEZyHvvpq.jpg", 7.3],
  ["Sound of Metal", "/y89kFMNYXNKMdlZjR2yg7nQtcQH.jpg", 7.7],
  ["The Florida Project", "/bnSTP1PY2fDyat0eUa4QouuGV7F.jpg", 7.4],
  ["The Favourite", "/cwBq0onfmeilU5xgqNNjJAMPfpw.jpg", 7.5],
  ["Ford v Ferrari", "/dR1Ju50iudrOh3YgfwkAU1g2HZe.jpg", 8.0],
  ["1917", "/iZf0KyrE25z1sage4SYFLCCrMi9.jpg", 8.0],
  ["Jojo Rabbit", "/7GsM4mtM0worCtIVeiQt28HieeN.jpg", 8.0],
  ["The Irishman", "/mbm8k3GFhXS0ROd9AD1gqYbIFbM.jpg", 7.6],
] as const;

const groupDefinitions = [
  { name: "Cinema Society", slug: "demo-cinema-society", location: "Scotiabank Theatre", memberIndexes: [0, 1, 2, 3] },
  { name: "Weekend Crew", slug: "demo-weekend-crew", location: "Maya's apartment", memberIndexes: [0, 2, 3, 4] },
  { name: "Family Movie Night", slug: "demo-family-movie-night", location: "Home theatre", memberIndexes: [0, 1, 4, 5] },
];

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const run = async () => {
  await mongoose.connect(uri);

  const reviewUser = await User.findOne({ email: reviewEmail });
  if (!reviewUser) throw new Error(`Review user ${reviewEmail} was not found.`);

  const password = await bcrypt.hash("DemoMember!2026", 10);
  const seededUsers = [reviewUser];
  for (const member of demoMembers) {
    const user = await User.findOneAndUpdate(
      { email: member.email },
      {
        $set: { name: member.name, avatar: member.avatar, firstLogin: false, provider: "local" },
        $setOnInsert: { password, tokenVersion: 0, role: "user" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededUsers.push(user);
  }

  const movies: IMovie[] = [];
  for (let index = 0; index < movieCatalog.length; index += 1) {
    const [title, poster, rating] = movieCatalog[index];
    const movie = await Movie.findOneAndUpdate(
      { imdbID: `demo-seed-${index + 1}` },
      { $set: { title, poster, vote_average: rating, addedBy: reviewUser._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (!movie) throw new Error(`Could not seed movie "${title}".`);
    movies.push(movie);
  }

  const seedMovieIds = new Set(movies.map((movie) => movie._id.toString()));
  const seededGroupIds: Types.ObjectId[] = [];

  for (let groupIndex = 0; groupIndex < groupDefinitions.length; groupIndex += 1) {
    const definition = groupDefinitions[groupIndex];
    const members = definition.memberIndexes.map((index) => seededUsers[index]._id);
    const group = await Group.findOneAndUpdate(
      { slug: definition.slug },
      {
        $set: {
          name: definition.name,
          creator: members[1] || reviewUser._id,
          members,
          pendingInvitations: [],
        },
        $setOnInsert: { movies: [], watchlist: [], pollHistory: [] },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    seededGroupIds.push(group._id);
    await WatchHistoryEntry.deleteMany({
      groupId: group._id,
      watchedNotes: { $regex: `^${seedNotePrefix}` },
    });

    const preservedHistory = (group.movies as any[]).filter(
      (entry) => !String(entry.watchedNotes || "").startsWith(seedNotePrefix)
    );
    const preservedWatchlist = (group.watchlist as any[]).filter(
      (entry) => !seedMovieIds.has(String(entry.movieId))
    );

    const groupHistory = Array.from({ length: 15 }, (_, index) => {
      const movie = movies[(groupIndex * 11 + index) % movies.length];
      const participantPool = members.filter((_, memberIndex) => index % 3 !== 0 || memberIndex !== 0);
      const participants = participantPool.slice(0, 2 + (index % Math.max(1, participantPool.length - 1)));
      const watchedAt = daysAgo(groupIndex * 13 + index * 9 + 2);
      return {
        movieId: movie._id,
        watchedDate: watchedAt,
        watchedAt,
        watchedWhere: definition.location,
        watchedLocation: definition.location,
        watchedWith: participants,
        watchedNotes: `${seedNotePrefix} ${definition.name} picked this one after a very close vote.`,
        ratings: participants.map((userId, ratingIndex) => ({
          userId,
          rating: 6 + ((index + ratingIndex + groupIndex) % 5),
          createdAt: watchedAt,
          updatedAt: watchedAt,
        })),
      };
    });

    const watchlist = Array.from({ length: 15 }, (_, index) => ({
      movieId: movies[(groupIndex * 11 + index + 15) % movies.length]._id,
      addedBy: members[index % members.length],
      addedAt: daysAgo(index + groupIndex * 4),
    }));

    group.movies = [...preservedHistory, ...groupHistory] as any;
    group.watchlist = [...preservedWatchlist, ...watchlist] as any;
    await group.save();
  }

  await syncLegacyGroupHistory(seededGroupIds);

  await WatchHistoryEntry.deleteMany({
    scope: "personal",
    createdBy: reviewUser._id,
    watchedNotes: { $regex: `^${seedNotePrefix}` },
  });

  const personalEntries = Array.from({ length: 15 }, (_, index) => {
    const watchedAt = daysAgo(index * 12 + 4);
    return {
      movieId: movies[(index + 30) % movies.length]._id,
      scope: "personal" as const,
      createdBy: reviewUser._id,
      participants: [reviewUser._id],
      watchedAt,
      watchedLocation: index % 2 === 0 ? "Home" : "Downtown Cinema",
      watchedNotes: `${seedNotePrefix} Personal diary entry with a few thoughts to remember later.`,
      ratings: [{ userId: reviewUser._id, rating: 7 + (index % 4), createdAt: watchedAt, updatedAt: watchedAt }],
    };
  });
  await WatchHistoryEntry.insertMany(personalEntries);

  const personalWatchlist = movies.slice(0, 15).map((movie) => movie._id);
  await User.updateOne(
    { _id: reviewUser._id },
    { $addToSet: { watchlist: { $each: personalWatchlist } }, $set: { favoriteGroups: seededGroupIds.slice(0, 2) } }
  );

  const personalHistoryCount = await WatchHistoryEntry.countDocuments({ participants: reviewUser._id });
  console.log(JSON.stringify({
    database: databaseName,
    reviewUser: reviewUser.email,
    demoUsers: demoMembers.length,
    groups: groupDefinitions.map((group) => group.name),
    groupWatchlistEntries: groupDefinitions.length * 15,
    groupHistoryEntries: groupDefinitions.length * 15,
    personalOnlyEntries: personalEntries.length,
    reviewUserVisibleHistoryEntries: personalHistoryCount,
  }, null, 2));

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Demo history seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
