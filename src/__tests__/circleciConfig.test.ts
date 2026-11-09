import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(process.cwd(), ".circleci", "config.yml"), "utf8");

describe("SNHU Tools CircleCI writer configuration", () => {
  it("uses three disabled-by-default, independently gated writer workflows", () => {
    for (const parameter of ["run_program_sync", "run_course_sync", "run_transfer_sync"]) {
      expect(config).toMatch(new RegExp(`${parameter}:\\s*\\n\\s*type: boolean\\s*\\n\\s*default: false`));
      expect(config).toContain(`when: << pipeline.parameters.${parameter} >>`);
    }
  });

  it("keeps each domain's command, validator, and context explicit", () => {
    expect(config).toContain("npm run program:sync");
    expect(config).toContain("npm run catalog:sync");
    expect(config).toContain("npm run transfer:sync");
    expect(config).toContain("scripts/validate-sync-result.mjs /tmp/sync-results/sync-output.json");
    expect(config).toContain("scripts/validate-sync-result.mjs --domain=catalog /tmp/sync-results/sync-output.json");
    expect(config).toContain("scripts/validate-sync-result.mjs --domain=transfer /tmp/sync-results/sync-output.json");
    expect(config).toContain("snhu-tools-program-sync");
    expect(config).toContain("snhu-tools-course-sync");
    expect(config).toContain("snhu-tools-transfer-sync");
  });

  it("preserves logs and does not include legacy contexts, branch filters, or post-sync revalidation", () => {
    expect(config).toContain("sync-output.log");
    expect(config).toContain("sync-output.json");
    expect(config).toContain("sync-exit-code");
    expect(config).toContain("validation-exit-code");
    expect(config).toContain("store_artifacts");
    expect(config).not.toMatch(/snhu-(?:deg[\w-]*|courses|transfers)-sync/);
    expect(config).not.toMatch(/scope=all/);
    expect(config).not.toMatch(/filters:\s*[\s\S]*branches|\bmaster\b|\bmain\b/);
    expect(config).not.toMatch(/triggers:|schedule:|cron:/);
    expect(config).not.toMatch(/scope=(?:programs|courses|transfers)/);
    expect(config).not.toMatch(/\/api\/revalidate/);
    expect(config).not.toContain('"$SYNC_ACTION" = "promoted"');
    expect(config).not.toContain("Authorization: Bearer ${REVALIDATE_SECRET}");
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
