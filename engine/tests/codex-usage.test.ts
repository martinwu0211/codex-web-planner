import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCodexUsage } from "../src/metrics/codex-usage.js";

const oldHome = process.env.CODEX_HOME;
const oldThread = process.env.CODEX_THREAD_ID;

afterEach(() => {
  if (oldHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = oldHome;
  if (oldThread === undefined) delete process.env.CODEX_THREAD_ID;
  else process.env.CODEX_THREAD_ID = oldThread;
});

describe("readCodexUsage", () => {
  it("reads current thread tokens and rate limits from local rollout records", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cwp-usage-"));
    const thread = "01a0c28a-457a-75d2-aede-595d24e82fa8";
    const dir = path.join(root, "sessions", "2026", "09", "21");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `rollout-2026-09-21T00-00-00-${thread}.jsonl`), [
      JSON.stringify({ payload: { usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } }, type: "token_usage_record" }),
      JSON.stringify({ payload: { rate_limits: { primary: { window_minutes: 300, used_percent: 36 }, secondary: { window_minutes: 10080, used_percent: 18 } } } }),
    ].join("\n"));
    process.env.CODEX_HOME = root;
    process.env.CODEX_THREAD_ID = thread;
    expect(readCodexUsage()).toMatchObject({
      available: true,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      fiveHourRemaining: "64%",
      weeklyRemaining: "82%",
    });
  });

  it("returns a clear result when the thread id is missing", () => {
    delete process.env.CODEX_THREAD_ID;
    expect(readCodexUsage()).toMatchObject({ available: false, reason: "CODEX_THREAD_ID 未设置" });
  });

  it("returns unavailable when the current thread has no unique rollout", () => {
    process.env.CODEX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cwp-usage-missing-"));
    process.env.CODEX_THREAD_ID = "01a0c28a-457a-75d2-aede-595d24e82fa8";
    expect(readCodexUsage()).toMatchObject({ available: false, reason: "找不到当前会话记录" });
  });

  it("does not choose between duplicate rollout files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cwp-usage-duplicate-"));
    const thread = "01a0c28a-457a-75d2-aede-595d24e82fa8";
    const first = path.join(root, "sessions", "2026", "09", "21");
    const second = path.join(root, "sessions", "2026", "09", "22");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    const line = JSON.stringify({ type: "token_usage_record", payload: { usage: { total_tokens: 1 } } });
    fs.writeFileSync(path.join(first, `rollout-a-${thread}.jsonl`), line);
    fs.writeFileSync(path.join(second, `rollout-b-${thread}.jsonl`), line);
    process.env.CODEX_HOME = root;
    process.env.CODEX_THREAD_ID = thread;
    expect(readCodexUsage()).toMatchObject({ available: false, reason: "找不到当前会话记录" });
  });

  it("maps quota windows by window_minutes regardless of order", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cwp-usage-reverse-"));
    const thread = "01a0c28a-457a-75d2-aede-595d24e82fa8";
    const dir = path.join(root, "sessions", "2026", "09", "21");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `rollout-reverse-${thread}.jsonl`), JSON.stringify({
      type: "rate_limits",
      payload: { rate_limits: { primary: { window_minutes: 10080, used_percent: 18 }, secondary: { window_minutes: 300, used_percent: 36 } } },
    }));
    process.env.CODEX_HOME = root;
    process.env.CODEX_THREAD_ID = thread;
    expect(readCodexUsage()).toMatchObject({ available: true, fiveHourRemaining: "64%", weeklyRemaining: "82%" });
  });
});
