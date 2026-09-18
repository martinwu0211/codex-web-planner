import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { estimateTokens, readTokenUsage, recordMcpExchange } from "../src/metrics/token-counter.js";

const previous = process.env.C2C_STATE_DIR;
const tempDirs: string[] = [];

afterEach(() => {
  if (previous === undefined) delete process.env.C2C_STATE_DIR;
  else process.env.C2C_STATE_DIR = previous;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("token usage counter", () => {
  it("estimates without retaining content", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(8)).toBe(2);
  });

  it("persists aggregate numeric metrics in the private state directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-metrics-"));
    tempDirs.push(dir);
    process.env.C2C_STATE_DIR = dir;
    recordMcpExchange(10, 20);
    recordMcpExchange(5, 0);
    expect(readTokenUsage()).toMatchObject({
      requests: 2,
      inputChars: 15,
      outputChars: 20,
      estimatedInputTokens: 5,
      estimatedOutputTokens: 5,
    });
    const raw = fs.readFileSync(path.join(dir, "metrics", "token-usage.json"), "utf8");
    expect(raw).not.toMatch(/MCP|secret|content/i);
  });
});
