import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendAudit, auditFile, readAuditTail, redact } from "../src/audit/index.js";

const previous = process.env.C2C_STATE_DIR;
const tempDirs: string[] = [];

afterEach(() => {
  if (previous === undefined) delete process.env.C2C_STATE_DIR;
  else process.env.C2C_STATE_DIR = previous;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("external audit trail", () => {
  it("writes only to the fixed state audit path and redacts secrets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-audit-"));
    tempDirs.push(dir);
    process.env.C2C_STATE_DIR = dir;
    appendAudit({
      event: "test.secret",
      detail: { token: "c2c_at_very-secret-value", pairing: "ABCD-EFGH", content: "not retained" },
    });

    expect(auditFile()).toBe(path.join(dir, "audit", "events.jsonl"));
    expect(fs.statSync(auditFile()).mode & 0o777).toBe(0o600);
    const raw = fs.readFileSync(auditFile(), "utf8");
    expect(raw).toContain("[REDACTED]");
    expect(raw).not.toContain("very-secret-value");
    expect(raw).not.toContain("not retained");
    expect(readAuditTail()).toHaveLength(1);
  });

  it("redacts bearer and token-shaped values before persistence", () => {
    expect(redact("Bearer c2c_at_abcdefghijklmnop")).toContain("[REDACTED]");
    expect(redact('access_token="abcdefghijklmnop"')).toContain("[REDACTED]");
  });
});
