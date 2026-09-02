import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDatabaseRuntimeMode, isUnifiedDatabaseRuntime } from "../runtimeMode";

describe("runtimeMode helper", () => {
  const originalMode = process.env.SNHU_TOOLS_DATABASE_MODE;

  beforeEach(() => {
    delete process.env.SNHU_TOOLS_DATABASE_MODE;
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.SNHU_TOOLS_DATABASE_MODE;
    } else {
      process.env.SNHU_TOOLS_DATABASE_MODE = originalMode;
    }
  });

  it("defaults to legacy mode when SNHU_TOOLS_DATABASE_MODE is unset", () => {
    expect(isUnifiedDatabaseRuntime()).toBe(false);
    expect(getDatabaseRuntimeMode()).toBe("legacy");
  });

  it("defaults to legacy mode when SNHU_TOOLS_DATABASE_MODE is empty or whitespace", () => {
    process.env.SNHU_TOOLS_DATABASE_MODE = "";
    expect(isUnifiedDatabaseRuntime()).toBe(false);
    expect(getDatabaseRuntimeMode()).toBe("legacy");

    process.env.SNHU_TOOLS_DATABASE_MODE = "   ";
    expect(isUnifiedDatabaseRuntime()).toBe(false);
    expect(getDatabaseRuntimeMode()).toBe("legacy");
  });

  it("returns false for explicit 'legacy' mode", () => {
    process.env.SNHU_TOOLS_DATABASE_MODE = "legacy";
    expect(isUnifiedDatabaseRuntime()).toBe(false);
    expect(getDatabaseRuntimeMode()).toBe("legacy");
  });

  it("returns true for explicit 'unified' mode", () => {
    process.env.SNHU_TOOLS_DATABASE_MODE = "unified";
    expect(isUnifiedDatabaseRuntime()).toBe(true);
    expect(getDatabaseRuntimeMode()).toBe("unified");
  });

  it("throws clear error for typos or unsupported mode values", () => {
    const invalidModes = ["unfied", "true", "1", "production", "default", "Unified", "LEGACY"];
    for (const invalid of invalidModes) {
      process.env.SNHU_TOOLS_DATABASE_MODE = invalid;
      expect(() => isUnifiedDatabaseRuntime()).toThrow(
        `Invalid SNHU_TOOLS_DATABASE_MODE: "${invalid}". Expected "legacy", "unified", or unset.`
      );
      expect(() => getDatabaseRuntimeMode()).toThrow(
        `Invalid SNHU_TOOLS_DATABASE_MODE: "${invalid}". Expected "legacy", "unified", or unset.`
      );
    }
  });
});
