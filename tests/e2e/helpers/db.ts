import { MongoClient } from "mongodb";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const readServerEnvValue = (key: string) => {
  const envPath = path.resolve(process.cwd(), "server", ".env");
  if (!existsSync(envPath)) return undefined;

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return undefined;

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
};

const getDatabaseName = (uri: string) => {
  try {
    const normalized = uri.replace(/^mongodb\+srv:/, "mongodb:");
    const parsed = new URL(normalized);
    return parsed.pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
};

const assertSafeTestDatabase = (uri: string) => {
  const dbName = getDatabaseName(uri).toLowerCase();
  if (!dbName || (!dbName.includes("test") && !dbName.includes("e2e"))) {
    throw new Error(
      `Refusing to clear non-test database "${dbName || "(missing database name)"}". Set E2E_MONGODB_URI to a test database.`
    );
  }
};

export const clearTestDatabase = async () => {
  const uri = process.env.E2E_MONGODB_URI || process.env.MONGODB_URI || readServerEnvValue("MONGODB_URI");
  if (!uri) {
    throw new Error("E2E_MONGODB_URI or MONGODB_URI is required for E2E database cleanup.");
  }

  assertSafeTestDatabase(uri);

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const collections = await db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  } finally {
    await client.close();
  }
};
