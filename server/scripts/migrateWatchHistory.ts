import dotenv from "dotenv";
import mongoose from "mongoose";
import { syncLegacyGroupHistory } from "../utils/watchHistory";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

const run = async () => {
  await mongoose.connect(uri);
  if (dryRun) {
    const Group = (await import("../models/Groups")).default;
    const groups = await Group.find({ "movies.0": { $exists: true } }).select("movies").lean();
    const entriesFound = groups.reduce((sum, group) => sum + (group.movies?.length || 0), 0);
    console.log(JSON.stringify({ dryRun: true, groupsScanned: groups.length, entriesFound }, null, 2));
  } else {
    const result = await syncLegacyGroupHistory();
    console.log(JSON.stringify({ dryRun: false, ...result }, null, 2));
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Watch history migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
