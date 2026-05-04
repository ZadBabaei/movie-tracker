import { MongoClient } from "mongodb";

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
  const uri = process.env.E2E_MONGODB_URI;
  if (!uri) {
    throw new Error(
      "E2E_MONGODB_URI is required. E2E tests refuse to use MONGODB_URI or server/.env."
    );
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
