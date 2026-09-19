import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";

export interface IsolatedTestMongo {
  source: "TEST_MONGODB_URI" | "E2E_MONGODB_URI" | "local_mongod";
  stop(): Promise<void>;
}

const reservePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a MongoDB test port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitForPort = async (port: number, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for isolated MongoDB test process.");
};

const deriveTestUri = (uri: string) => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Test MongoDB URI is malformed.");
  }
  const suppliedName = parsed.pathname.replace(/^\//, "");
  if (!suppliedName || !/(?:test|e2e)/i.test(suppliedName)) {
    throw new Error("Test MongoDB URI must name an explicit test/e2e database.");
  }
  const safeBase = suppliedName.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
  const suffix = crypto.randomBytes(6).toString("hex");
  parsed.pathname = `/${safeBase}_unit_${process.pid}_${suffix}`;
  return parsed.toString();
};

export const startIsolatedTestMongo = async (
  localDatabasePrefix: string
): Promise<IsolatedTestMongo> => {
  const externalSource = process.env.TEST_MONGODB_URI
    ? "TEST_MONGODB_URI"
    : process.env.E2E_MONGODB_URI
      ? "E2E_MONGODB_URI"
      : undefined;
  const externalUri = externalSource ? process.env[externalSource] : undefined;

  if (externalSource && externalUri) {
    await mongoose.connect(deriveTestUri(externalUri));
    return {
      source: externalSource,
      async stop() {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      },
    };
  }

  const port = await reservePort();
  const directory = await mkdtemp(path.join(tmpdir(), `${localDatabasePrefix}-`));
  const processHandle = spawn(
    "mongod",
    ["--dbpath", directory, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let mongoError = "";
  processHandle.stderr?.on("data", (chunk) => {
    mongoError += chunk.toString();
  });
  processHandle.once("error", (error) => {
    mongoError += error.message;
  });

  try {
    await waitForPort(port);
    await mongoose.connect(
      `mongodb://127.0.0.1:${port}/${localDatabasePrefix.replace(/[^a-z0-9_-]/gi, "_")}`
    );
  } catch (error) {
    if (processHandle.exitCode === null) processHandle.kill();
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Failed to start isolated MongoDB: ${mongoError || String(error)}`);
  }

  return {
    source: "local_mongod",
    async stop() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      if (processHandle.exitCode === null) {
        const exited = new Promise<void>((resolve) =>
          processHandle.once("exit", () => resolve())
        );
        processHandle.kill();
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
};
