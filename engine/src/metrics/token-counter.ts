import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir } from "../config/paths.js";

export interface TokenUsageSnapshot {
  schemaVersion: 1;
  updatedAt: string;
  requests: number;
  inputChars: number;
  outputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

const usageFile = (): string => path.join(getStateDir(), "metrics", "token-usage.json");

/** A conservative, content-free estimate suitable for comparing runs (chars / 4). */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

export function recordMcpExchange(inputChars: number, outputChars: number): void {
  try {
    const file = usageFile();
    let current: Partial<TokenUsageSnapshot> = {};
    try {
      current = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<TokenUsageSnapshot>;
    } catch {
      // First exchange: start a fresh aggregate.
    }
    const next: TokenUsageSnapshot = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      requests: Number(current.requests ?? 0) + 1,
      inputChars: Number(current.inputChars ?? 0) + Math.max(0, inputChars),
      outputChars: Number(current.outputChars ?? 0) + Math.max(0, outputChars),
      estimatedInputTokens: Number(current.estimatedInputTokens ?? 0) + estimateTokens(inputChars),
      estimatedOutputTokens: Number(current.estimatedOutputTokens ?? 0) + estimateTokens(outputChars),
    };
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  } catch {
    // Metrics must never break the MCP bridge.
  }
}

export function readTokenUsage(): TokenUsageSnapshot {
  try {
    return JSON.parse(fs.readFileSync(usageFile(), "utf8")) as TokenUsageSnapshot;
  } catch {
    return {
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
      requests: 0,
      inputChars: 0,
      outputChars: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    };
  }
}
