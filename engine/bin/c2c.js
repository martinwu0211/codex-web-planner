#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist", "cli", "index.js");
const engineRoot = path.join(here, "..");

function runtimeReady() {
  try {
    createRequire(import.meta.url).resolve("commander");
    return true;
  } catch {
    return false;
  }
}

if (!runtimeReady()) {
  process.stderr.write("codex-web-planner: installing bundled engine dependencies…\n");
  const installer = process.env.npm_execpath
    ? [process.execPath, process.env.npm_execpath]
    : ["npx", "--yes", "pnpm@11.24.0"];
  const result = spawnSync(installer[0], [...installer.slice(1), "install", "--prod", "--frozen-lockfile"], {
    cwd: engineRoot,
    stdio: "inherit",
  });
  if (result.status !== 0 || !runtimeReady()) {
    process.stderr.write("codex-web-planner: dependency setup failed; rerun the plugin setup from Codex.\n");
    process.exit(result.status ?? 1);
  }
}

if (existsSync(dist)) {
  await import(pathToFileURL(dist).href);
} else {
  // dev fallback: run TypeScript sources through the tsx ESM loader
  const entry = path.join(here, "..", "src", "cli", "index.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx/esm", entry, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}
