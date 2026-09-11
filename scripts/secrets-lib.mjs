import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireAccessToken() {
  if (!process.env.BWS_ACCESS_TOKEN?.trim()) {
    throw new Error("BWS_ACCESS_TOKEN is required.");
  }
}

function runBws(args, { json = false } = {}) {
  const result = spawnSync("bws", args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    throw new Error("The Bitwarden CLI request failed. No secret values were logged.");
  }

  if (!json) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("The Bitwarden CLI returned an unexpected response.");
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveProject(projectName) {
  const projects = asArray(
    runBws(["project", "list", "--output", "json", "--color", "no"], {
      json: true,
    }),
  );
  const matches = projects.filter((project) => project.name === projectName);

  if (matches.length === 0) {
    throw new Error(`Bitwarden project "${projectName}" does not exist.`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple Bitwarden projects are named "${projectName}".`);
  }

  return matches[0];
}

function listSecrets(projectId) {
  return asArray(
    runBws(
      ["secret", "list", projectId, "--output", "json", "--color", "no"],
      { json: true },
    ),
  );
}

function parseEnv(content, sourcePath) {
  const variables = new Map();
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      throw new Error(`Unsupported env syntax in ${sourcePath} at line ${index + 1}.`);
    }

    const [, name, rawInput] = match;
    if (variables.has(name)) {
      throw new Error(`Duplicate variable ${name} in ${sourcePath}.`);
    }
    if (name === "BWS_ACCESS_TOKEN") {
      throw new Error(`BWS_ACCESS_TOKEN must not be stored in ${sourcePath}.`);
    }

    let rawValue = rawInput.trim();
    let value;
    const quote = rawValue[0];

    if (quote === '"' || quote === "'" || quote === "`") {
      if (rawValue.length < 2 || rawValue.at(-1) !== quote) {
        throw new Error(`Unsupported multiline value for ${name} in ${sourcePath}.`);
      }
      value = rawValue.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\"/g, '"')
          .replace(/\\\$/g, "$")
          .replace(/\\\\/g, "\\");
      }
    } else {
      rawValue = rawValue.replace(/\s+#.*$/, "").trim();
      value = rawValue;
    }

    variables.set(name, value);
  }

  return variables;
}

function formatEnvValue(value) {
  if (value === "") {
    return "";
  }
  if (/^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) {
    return value;
  }

  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")}"`;
}

function serializeEnv(variables) {
  const lines = [...variables.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${formatEnvValue(value)}`);
  return `${lines.join("\n")}\n`;
}

function safeTarget(rootDir, relativePath) {
  const target = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Env target escapes the repository: ${relativePath}`);
  }
  return target;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const suffix = `${process.pid}-${randomUUID()}`;
  const temporary = `${target}.${suffix}.tmp`;
  const backup = `${target}.${suffix}.bak`;
  const hadOriginal = await exists(target);

  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });

  try {
    if (hadOriginal) {
      await rename(target, backup);
    }
    await rename(temporary, target);
    if (hadOriginal) {
      await rm(backup, { force: true });
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (hadOriginal && (await exists(backup)) && !(await exists(target))) {
      await rename(backup, target).catch(() => {});
    }
    throw error;
  }
}

function validateConfig(config) {
  if (!config.rootDir || !config.projectName || !config.appLabel) {
    throw new Error("The secrets script configuration is incomplete.");
  }
  for (const mapping of config.mappings) {
    if (!mapping.namespace || !mapping.path) {
      throw new Error("Each secrets mapping needs a namespace and env path.");
    }
  }
}

function secretIndex(secrets) {
  const index = new Map();
  for (const secret of secrets) {
    if (index.has(secret.key)) {
      throw new Error(`Duplicate Bitwarden secret key: ${secret.key}`);
    }
    index.set(secret.key, secret);
  }
  return index;
}

export async function pushSecrets(config) {
  requireAccessToken();
  validateConfig(config);

  const project = resolveProject(config.projectName);
  const existing = secretIndex(listSecrets(project.id));
  const localSecrets = new Map();
  const parsedFiles = new Map();

  for (const mapping of config.mappings) {
    const target = safeTarget(config.rootDir, mapping.path);
    if (!(await exists(target))) {
      continue;
    }

    let variables = parsedFiles.get(target);
    if (!variables) {
      variables = parseEnv(await readFile(target, "utf8"), mapping.path);
      parsedFiles.set(target, variables);
    }

    for (const [name, value] of variables) {
      if (mapping.include && !mapping.include(name)) {
        continue;
      }
      const key = `${mapping.namespace}__${name}`;
      if (localSecrets.has(key)) {
        throw new Error(`Multiple local variables map to ${key}.`);
      }
      localSecrets.set(key, { mapping, name, value });
    }
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [key, local] of localSecrets) {
    const remote = existing.get(key);
    if (!remote) {
      const note = `Managed from ${local.mapping.path} as ${local.name}`;
      runBws([
        "secret",
        "create",
        "--note",
        note,
        "--output",
        "none",
        "--color",
        "no",
        "--",
        key,
        local.value,
        project.id,
      ]);
      created += 1;
    } else if (remote.value !== local.value) {
      runBws([
        "secret",
        "edit",
        remote.id,
        `--value=${local.value}`,
        "--output",
        "none",
        "--color",
        "no",
      ]);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const verified = secretIndex(listSecrets(project.id));
  for (const [key, local] of localSecrets) {
    const remote = verified.get(key);
    if (!remote || remote.value !== local.value) {
      throw new Error(`Verification failed for ${key}.`);
    }
  }

  console.log(`${config.appLabel}:`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
}

export async function pullSecrets(config) {
  requireAccessToken();
  validateConfig(config);

  const project = resolveProject(config.projectName);
  const secrets = listSecrets(project.id);
  const outputs = new Map();

  for (const mapping of config.mappings) {
    const target = safeTarget(config.rootDir, mapping.path);
    let variables = outputs.get(target);
    if (!variables) {
      variables = new Map();
      outputs.set(target, variables);
    }

    const prefix = `${mapping.namespace}__`;
    for (const secret of secrets) {
      if (!secret.key.startsWith(prefix)) {
        continue;
      }
      const name = secret.key.slice(prefix.length);
      if (!ENV_NAME.test(name)) {
        throw new Error(`Invalid env variable name in Bitwarden: ${secret.key}`);
      }
      if (mapping.include && !mapping.include(name)) {
        throw new Error(`Bitwarden secret ${secret.key} is mapped to the wrong component.`);
      }
      if (variables.has(name)) {
        throw new Error(`Multiple Bitwarden secrets map to ${name} in ${mapping.path}.`);
      }
      variables.set(name, secret.value);
    }
  }

  let written = 0;
  for (const [target, variables] of outputs) {
    if (variables.size === 0) {
      continue;
    }
    await atomicWrite(target, serializeEnv(variables));
    written += 1;
  }

  console.log(`${config.appLabel}:`);
  console.log(`Env files written: ${written}`);
}

