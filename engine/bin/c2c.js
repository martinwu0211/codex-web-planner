#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist", "cli", "index.js");
const engineRoot = path.join(here, "..");

function runtimeReady() {
  return existsSync(path.join(engineRoot, "node_modules", "commander"));
}

if (!runtimeReady()) {
  process.stderr.write("codex-web-planner: installing bundled engine dependencies…\n");
  const installer = process.env.npm_execpath
    ? [process.execPath, process.env.npm_execpath]
    : ["npx", "--yes", "pnpm@11.24.0"];
  let result;
  try {
    result = spawnSync(installer[0], [...installer.slice(1), "install", "--prod", "--frozen-lockfile"], {
      cwd: engineRoot,
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
      timeout: 120_000,
    });
  } catch (error) {
    process.stderr.write(`codex-web-planner: CWP_DEPENDENCY_SETUP_FAILED (${error instanceof Error ? error.message : String(error)})\n`);
    process.stderr.write("Next action: check network access, then rerun the plugin setup; no task was started.\n");
    process.exit(1);
  }
  if (result.status !== 0 || !runtimeReady()) {
    const reason = result.signal === "SIGTERM" ? "CWP_DEPENDENCY_SETUP_TIMEOUT" : "CWP_DEPENDENCY_SETUP_FAILED";
    process.stderr.write(`codex-web-planner: ${reason}; dependency setup did not finish.\n`);
    process.stderr.write("Next action: check network access or cached dependencies, then rerun the plugin setup; no task was started.\n");
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
