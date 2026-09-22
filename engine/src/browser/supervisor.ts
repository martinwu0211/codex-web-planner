import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { getStateDir, ensureDir } from "../config/paths.js";

export type BrowserState = "missing" | "stopped" | "running" | "unreachable";

export interface BrowserStatus {
  state: BrowserState;
  executable: string | null;
  pid: number | null;
  debugPort: number;
  profileDir: string;
  loginHint: string;
}

const runtimeFile = () => path.join(getStateDir(), "browser", "runtime.json");
const profileDir = () => path.join(getStateDir(), "browser", "profile");
const candidates = (): string[] => [
  process.env.CODEX_WEB_PLANNER_BROWSER,
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  path.join(os.homedir(), ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"),
].filter((v): v is string => Boolean(v));

function findExecutable(): string | null {
  return candidates().find((candidate) => fs.existsSync(candidate)) ?? null;
}

function readRuntime(): { pid?: number; port?: number } {
  try { return JSON.parse(fs.readFileSync(runtimeFile(), "utf8")) as { pid?: number; port?: number }; }
  catch { return {}; }
}

async function reachable(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch { return false; }
}

export async function browserStatus(debugPort = 9222): Promise<BrowserStatus> {
  const executable = findExecutable();
  const runtime = readRuntime();
  if (!executable) return { state: "missing", executable: null, pid: null, debugPort, profileDir: profileDir(), loginHint: "Install Chromium or set CODEX_WEB_PLANNER_BROWSER." };
  const live = await reachable(debugPort);
  if (live) return { state: "running", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "Open ChatGPT in the visible browser and sign in if required." };
  return { state: runtime.pid && processExists(runtime.pid) ? "unreachable" : "stopped", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "The browser will open ChatGPT after start." };
}

function processExists(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

export async function startBrowser(debugPort = 9222): Promise<BrowserStatus> {
  const before = await browserStatus(debugPort);
  if (before.state === "running") return before;
  if (!before.executable) return before;
  ensureDir(path.dirname(runtimeFile()));
  ensureDir(profileDir());
  const child: ChildProcess = spawn(before.executable, [
    `--user-data-dir=${profileDir()}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${debugPort}`,
    "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "https://chatgpt.com/",
  ], { detached: true, stdio: "ignore" });
  child.unref();
  fs.writeFileSync(runtimeFile(), JSON.stringify({ pid: child.pid, port: debugPort }) + "\n", { mode: 0o600 });
  for (let i = 0; i < 30; i += 1) { if ((await browserStatus(debugPort)).state === "running") break; await new Promise((resolve) => setTimeout(resolve, 200)); }
  return browserStatus(debugPort);
}

export async function stopBrowser(debugPort = 9222): Promise<BrowserStatus> {
  const current = await browserStatus(debugPort);
  if (current.pid && processExists(current.pid)) { try { process.kill(current.pid, "SIGTERM"); } catch { /* already gone */ } }
  try { fs.unlinkSync(runtimeFile()); } catch { /* no runtime file */ }
  return { ...current, state: "stopped", pid: null };
}
