import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const validator = join(process.cwd(), "scripts", "validate-sync-result.mjs");

function validate(result: unknown): { status: number; output: string } {
  const directory = mkdtempSync(join(tmpdir(), "snhu-sync-result-"));
  const resultPath = join(directory, "result.json");
  writeFileSync(resultPath, typeof result === "string" ? result : JSON.stringify(result));
  try {
    const output = execFileSync(process.execPath, [validator, resultPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, output };
  } catch (error) {
    const processError = error as { status?: number; stderr?: Buffer };
    return { status: processError.status || 1, output: processError.stderr?.toString() || "" };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("CircleCI catalog synchronization configuration", () => {
  const baseResult = { status: "idle", importedCount: 236, skippedCount: 0, failedCount: 0 };

  it("accepts structurally valid promoted, skipped, and error results", () => {
    expect(validate({ ...baseResult, action: "promoted" }).status).toBe(0);
    expect(validate({ ...baseResult, action: "skipped", status: "in_progress" }).status).toBe(0);
    expect(validate({ ...baseResult, action: "error", status: "error", failedCount: 1 }).status).toBe(0);
  });

  it("rejects malformed and incomplete synchronization results", () => {
    expect(validate("not-json").status).not.toBe(0);
    expect(validate({ action: "promoted", status: "idle" }).status).not.toBe(0);
  });

  it("preserves logs and only revalidates after a successful promotion", () => {
    const config = readFileSync(join(process.cwd(), ".circleci", "config.yml"), "utf8");
    expect(config).toContain("snhu-tools-program-sync");
    expect(config).toContain("sync-output.log");
    expect(config).toContain("sync-output.json");
    expect(config).toContain("sync-exit-code");
    expect(config).toContain("validation-exit-code");
    expect(config).toContain("store_artifacts");
    expect(config).toContain('"$SYNC_ACTION" = "promoted"');
    expect(config).toContain("Authorization: Bearer ${REVALIDATE_SECRET}");
    expect(config).not.toMatch(/vercel\s+cron/i);
    expect(config).not.toMatch(/CIRCLECI_(?:API|CLI)_TOKEN/);
  });

  it("pins the TypeScript runner used by catalog jobs", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies?.tsx).toBeDefined();
    expect(packageJson.scripts?.["db:migrate"]).toBe("tsx scripts/migrate.ts");
    expect(packageJson.scripts?.["program:sync"]).toBe("tsx scripts/program-sync.ts");
  });
});
