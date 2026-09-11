import { fileURLToPath } from "node:url";
import { pullSecrets } from "./secrets-lib.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

await pullSecrets({
  appLabel: "Movie Tracker",
  projectName: "movie-tracker",
  rootDir,
  mappings: [
    { namespace: "CLIENT", path: "client/.env" },
    { namespace: "SERVER", path: "server/.env" },
  ],
});

