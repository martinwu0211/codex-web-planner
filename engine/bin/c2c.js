#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist", "cli", "index.js");
const engineRoot = path.join(here, "..");

// Read mode before dependency bootstrap, including on a clean installation.
const defaultStateDir = process.platform === "darwin"
  ? path.join(os.homedir(), "Library", "Application Support", "codex-with-chatgpt")
  : process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "codex-with-chatgpt")
    : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "codex-with-chatgpt");
let workMode = "codex";
try {
  const saved = JSON.parse(readFileSync(path.join(process.env.C2C_STATE_DIR?.trim() || defaultStateDir, "prefs.json"), "utf8"));
  if (["auto", "chat", "codex"].includes(saved.workMode)) workMode = saved.workMode;
} catch { /* Fresh installations use native Codex. */ }
const [command, subcommand] = process.argv.slice(2);
const connectionCommand = ["setup", "start", "restart", "serve", "pair", "wait-auth"].includes(command)
  || (command === "doctor" && !process.argv.includes("--no-fix"))
  || (command === "browser" && ["start", "ask", "prompt", "connector"].includes(subcommand))
  || (command === "tunnel" && ["choose", "login"].includes(subcommand));
if (workMode === "codex" && connectionCommand && !process.argv.includes("--help")) {
  const result = { ok: false, code: "CODEX_MODE_ACTIVE", mode: "codex", message: "ChatGPT connection actions are disabled in Codex mode. Change the saved work mode explicitly before connecting." };
  process.stdout.write((process.argv.includes("--json") ? JSON.stringify(result) : result.message) + "\n");
  process.exit(1);
}


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
