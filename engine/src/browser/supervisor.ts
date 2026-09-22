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
  chatgpt: "absent" | "login_required" | "ready" | "unknown";
  pages: number;
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

interface DevtoolsPage { id: string; type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string; }
async function pages(debugPort: number): Promise<DevtoolsPage[]> {
  try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as DevtoolsPage[]; }
  catch { return []; }
}

async function openChatGptPage(debugPort: number): Promise<void> {
  try {
    const targets = await pages(debugPort);
    if (targets.some((page) => /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""))) return;
    await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("https://chatgpt.com/")}`, { method: "PUT" });
  } catch { /* browser may not support remote page creation */ }
}

async function openConnectorPage(debugPort: number): Promise<DevtoolsPage | null> {
  const targets = await pages(debugPort);
  const existing = targets.find((page) => page.type === "page" && /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
  const url = "https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins";
  if (existing) {
    const alreadyOnForm = /chatgpt\.com\/plugins#settings\/Connectors/i.test(existing.url ?? "");
    if (!alreadyOnForm && existing.webSocketDebuggerUrl) {
      // Navigation may close the old CDP socket before it can return a value.
      try { await evaluate(existing.webSocketDebuggerUrl, `location.href = ${JSON.stringify(url)}`); } catch { /* expected during navigation */ }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    // Navigation can replace the renderer's CDP session. Re-read /json/list
    // instead of reusing the pre-navigation WebSocket URL.
    const refreshed = (await pages(debugPort)).find((page) => page.type === "page" && /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
    return refreshed ?? existing;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    return response.ok ? await response.json() as DevtoolsPage : null;
  } catch { return null; }
}

/** Fill the ChatGPT custom connector form. Pairing remains a visible user step. */
export async function configureChatGptConnector(name: string, mcpUrl: string, debugPort = 9222, submit = true): Promise<{ ok: boolean; code: string; message: string }> {
  const target = await openConnectorPage(debugPort);
  if (!target?.webSocketDebuggerUrl) return { ok: false, code: "CHATGPT_CONNECTOR_PAGE_MISSING", message: "ChatGPT connector form is not open." };
  try {
    let last: { ok: boolean; code: string; message: string } = { ok: false, code: "CHATGPT_CONNECTOR_FORM_NOT_READY", message: "Connector form is still loading." };
    for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await evaluate(target.webSocketDebuggerUrl, `(payload => {
      const setValue = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const nameOk = setValue('#custom-connector-name, input[name="name"]', payload.name);
      const urlOk = setValue('#custom-connector-url, input[name="url"]', payload.url);
      const oauth = document.querySelector('input[type="radio"][value*="oauth" i], input[type="radio"][id*="oauth" i]');
      if (oauth instanceof HTMLInputElement && !oauth.checked) oauth.click();
      if (!payload.submit) return { ok: nameOk && urlOk, code: nameOk && urlOk ? 'CHATGPT_CONNECTOR_FIELDS_FILLED' : 'CHATGPT_CONNECTOR_FORM_NOT_READY', message: nameOk && urlOk ? 'Connector name and MCP URL filled; pairing code remains for the user.' : 'Connector form fields were not found.' };
      const button = Array.from(document.querySelectorAll('button')).find(b => /^(create|save|创建|保存)$/i.test((b.textContent || '').trim()) && !b.disabled);
      if (!button) return { ok: false, code: 'CHATGPT_CONNECTOR_CREATE_BUTTON_MISSING', message: 'Connector fields are filled, but the Create button is not ready.' };
      button.click();
      return { ok: nameOk && urlOk, code: nameOk && urlOk ? 'CHATGPT_CONNECTOR_CREATED' : 'CHATGPT_CONNECTOR_FORM_NOT_READY', message: nameOk && urlOk ? 'Connector created; pairing code remains for the user.' : 'Connector form fields were not found.' };
    })(${JSON.stringify({ name, url: mcpUrl, submit })})`) as { ok: boolean; code: string; message: string };
      last = result;
      if (result.ok || result.code !== "CHATGPT_CONNECTOR_FORM_NOT_READY") return result;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return last;
  } catch { return { ok: false, code: "CHATGPT_CONNECTOR_BROWSER_ERROR", message: "ChatGPT connector form did not accept the fields." }; }
}

async function evaluate(wsUrl: string, expression: string): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const id = Math.floor(Math.random() * 1_000_000_000);
    const timer = setTimeout(() => { try { socket.close(); } catch {} reject(new Error("CDP evaluation timed out")); }, 3000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } })));
    socket.addEventListener("message", (event) => {
      try { const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } }; error?: unknown }; if (message.id !== id) return; clearTimeout(timer); socket.close(); if (message.error) reject(new Error("CDP evaluation failed")); else resolve(message.result?.result?.value); } catch { /* ignore unrelated messages */ }
    });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP websocket unavailable")); });
  });
}

async function chatgptState(debugPort: number): Promise<{ state: BrowserStatus["chatgpt"]; pages: number }> {
  const targets = (await pages(debugPort)).filter((page) => page.type === "page");
  const chat = targets.find((page) => /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
  if (!chat) return { state: "absent", pages: targets.length };
  if (!chat.webSocketDebuggerUrl) return { state: "unknown", pages: targets.length };
  try {
    const value = await evaluate(chat.webSocketDebuggerUrl, `(() => { const text = document.body?.innerText || ''; const hasComposer = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).some((el) => { const style = getComputedStyle(el); return style.display !== "none" && style.visibility !== "hidden" && el instanceof HTMLElement && el.offsetParent !== null; }); const login = /\\b(log in|sign in|登录|注册)\\b/i.test(text) && !hasComposer; return { login, hasComposer }; })()`);
    const result = value as { login?: boolean; hasComposer?: boolean };
    return { state: result.login ? "login_required" : result.hasComposer ? "ready" : "unknown", pages: targets.length };
  } catch { return { state: "unknown", pages: targets.length }; }
}

export async function sendChatGptPrompt(text: string, debugPort = 9222): Promise<{ ok: boolean; code: string; message: string }> {
  const target = (await pages(debugPort)).find((page) => page.type === "page" && /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
  if (!target?.webSocketDebuggerUrl) return { ok: false, code: "CHATGPT_PAGE_MISSING", message: "No ChatGPT page is open in the managed browser." };
  try {
    const result = await evaluate(target.webSocketDebuggerUrl, `(text => {
      const composer = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).find((el) => { const style = getComputedStyle(el); return style.display !== "none" && style.visibility !== "hidden" && el instanceof HTMLElement && el.offsetParent !== null; });
      if (!composer) return { ok: false, code: "CHATGPT_LOGIN_REQUIRED", message: "ChatGPT is not ready for input; sign in first." };
      if (composer instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(composer, text);
      } else { composer.textContent = text; }
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      const buttons = Array.from(document.querySelectorAll('button'));
      const send = buttons.find((b) => /send|发送|submit/i.test(b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.textContent || '') && !b.disabled);
      if (!send) return { ok: false, code: "CHATGPT_SEND_BUTTON_MISSING", message: "ChatGPT composer found but the send button was not detected." };
      send.click();
      return { ok: true, code: "CHATGPT_PROMPT_SENT", message: "Prompt sent to ChatGPT." };
    })(${JSON.stringify(text)})`);
    const first = result as { ok: boolean; code: string; message: string };
    if (first.ok || first.code !== "CHATGPT_SEND_BUTTON_MISSING") return first;
    // ChatGPT renders the send button asynchronously after the input event.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retry = await evaluate(target.webSocketDebuggerUrl, `(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const send = buttons.find((b) => /send|发送|submit/i.test(b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.textContent || '') && !b.disabled);
        if (!send) return { ok: false, code: "CHATGPT_SEND_BUTTON_MISSING", message: "ChatGPT composer found but the send button was not detected." };
        send.click();
        return { ok: true, code: "CHATGPT_PROMPT_SENT", message: "Prompt sent to ChatGPT." };
      })()`);
      const checked = retry as { ok: boolean; code: string; message: string };
      if (checked.ok) return checked;
    }
    return first;
  } catch { return { ok: false, code: "CHATGPT_BROWSER_ERROR", message: "The managed ChatGPT page did not accept the prompt." }; }
}

async function assistantReply(debugPort: number): Promise<{ ws?: string; text: string }> {
  const target = (await pages(debugPort)).find((page) => page.type === "page" && /chatgpt\.com|chat\.openai\.com/i.test(page.url ?? ""));
  if (!target?.webSocketDebuggerUrl) return { text: "" };
  const value = await evaluate(target.webSocketDebuggerUrl, `(() => Array.from(document.querySelectorAll('[data-message-author-role="assistant"]')).map((n) => (n.textContent || '').trim()).filter(Boolean).pop() || '')()`);
  return { ws: target.webSocketDebuggerUrl, text: typeof value === "string" ? value : "" };
}

export async function askChatGpt(text: string, debugPort = 9222, timeoutMs = 120_000, onWait?: (elapsedMs: number) => void): Promise<{ ok: boolean; code: string; message: string; response?: string }> {
  const before = await assistantReply(debugPort);
  const sent = await sendChatGptPrompt(text, debugPort);
  if (!sent.ok) return sent;
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  let last = before.text;
  let stableSince = 0;
  let lastHeartbeat = 0;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const elapsed = Date.now() - startedAt;
    if (onWait && elapsed - lastHeartbeat >= 30_000) { lastHeartbeat = elapsed; onWait(elapsed); }
    const current = await assistantReply(debugPort);
    if (current.text && current.text !== before.text) {
      if (current.text === last) { if (!stableSince) stableSince = Date.now(); if (Date.now() - stableSince >= 1500) return { ok: true, code: "CHATGPT_RESPONSE_RECEIVED", message: "ChatGPT returned a new response.", response: current.text }; }
      else { last = current.text; stableSince = 0; }
    }
  }
  return { ok: false, code: "CHATGPT_RESPONSE_TIMEOUT", message: "ChatGPT did not return a new response before the timeout." };
}

export async function browserStatus(debugPort = 9222): Promise<BrowserStatus> {
  const executable = findExecutable();
  const runtime = readRuntime();
  if (!executable) return { state: "missing", executable: null, pid: null, debugPort, profileDir: profileDir(), loginHint: "Install Chromium or set CODEX_WEB_PLANNER_BROWSER.", chatgpt: "absent", pages: 0 };
  const live = await reachable(debugPort);
  if (live) { const chat = await chatgptState(debugPort); return { state: "running", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: chat.state === "login_required" ? "Sign in to ChatGPT in the visible browser." : "ChatGPT browser is ready.", chatgpt: chat.state, pages: chat.pages }; }
  return { state: runtime.pid && processExists(runtime.pid) ? "unreachable" : "stopped", executable, pid: runtime.pid ?? null, debugPort, profileDir: profileDir(), loginHint: "The browser will open ChatGPT after start.", chatgpt: "absent", pages: 0 };
}

function processExists(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

export async function startBrowser(debugPort = 9222): Promise<BrowserStatus> {
  const before = await browserStatus(debugPort);
  if (before.state === "running") { await openChatGptPage(debugPort); return browserStatus(debugPort); }
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
  await openChatGptPage(debugPort);
  return browserStatus(debugPort);
}

export async function stopBrowser(debugPort = 9222): Promise<BrowserStatus> {
  const current = await browserStatus(debugPort);
  if (current.pid && processExists(current.pid)) { try { process.kill(current.pid, "SIGTERM"); } catch { /* already gone */ } }
  try { fs.unlinkSync(runtimeFile()); } catch { /* no runtime file */ }
  return { ...current, state: "stopped", pid: null, chatgpt: "absent", pages: 0 };
}
