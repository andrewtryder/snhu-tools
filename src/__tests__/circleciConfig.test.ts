import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(process.cwd(), ".circleci", "config.yml"), "utf8");

describe("unified CircleCI writer configuration", () => {
  it("uses three disabled-by-default, independently gated writer workflows", () => {
    for (const parameter of ["run_program_sync", "run_course_sync", "run_transfer_sync"]) {
      expect(config).toMatch(new RegExp(`${parameter}:\\s*\\n\\s*type: boolean\\s*\\n\\s*default: false`));
      expect(config).toContain(`when: << pipeline.parameters.${parameter} >>`);
    }
  });

  it("keeps each domain's command, validator, context, and scoped revalidation explicit", () => {
    expect(config).toContain("npm run program:sync");
    expect(config).toContain("npm run catalog:sync");
    expect(config).toContain("npm run transfer:sync");
    expect(config).toContain("scripts/validate-sync-result.mjs");
    expect(config).toContain("scripts/validators/validate-catalog-sync-result.mjs");
    expect(config).toContain("scripts/validators/validate-transfer-sync-result.mjs");
    expect(config).toContain("scope=programs");
    expect(config).toContain("scope=courses");
    expect(config).toContain("scope=transfers");
    expect(config).toContain("snhu-tools-program-sync");
    expect(config).toContain("snhu-tools-course-sync");
    expect(config).toContain("snhu-tools-transfer-sync");
  });

  it("does not add legacy contexts, runtime bridge variables, branch filters, or schedules", () => {
    expect(config).not.toMatch(/snhu-(?:deg[\w-]*|courses|transfers)-sync/);
    expect(config).not.toMatch(/COURSES_POSTGRES_URL|COURSES_POSTGRES_CA_CERT|TRANSFERS_POSTGRES_URL|TRANSFERS_POSTGRES_CA_CERT/);
    expect(config).not.toMatch(/scope=all/);
    expect(config).not.toMatch(/filters:\s*[\s\S]*branches|\bmaster\b|\bmain\b/);
    expect(config).not.toMatch(/triggers:|schedule:|cron:/);
  });
});
