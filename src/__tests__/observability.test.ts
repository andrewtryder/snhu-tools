import { describe, it, expect } from "vitest";
import { sanitizeLogValue } from "@/lib/observability";

describe("Observability & Secret Redaction Engine", () => {
  it("redacts database URLs containing passwords", () => {
    const rawUrl = "postgres://user:super_secret_password@db.neon.tech/neondb";
    const sanitized = sanitizeLogValue(rawUrl);
    expect(sanitized).toContain("[REDACTED]");
  });

  it("redacts postgresql URLs including URL-encoded credential characters", () => {
    const sanitized = sanitizeLogValue("failed postgresql://user:p%40ss@example.invalid/db");
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).not.toContain("p%40ss");
  });

  it("redacts bearer secret tokens in strings", () => {
    const rawHeader = "Bearer secret_token_xyz_123";
    const sanitized = sanitizeLogValue(rawHeader);
    expect(sanitized).toBe("[REDACTED]");
  });

  it("redacts sensitive keys in nested context objects", () => {
    const context = {
      catalogId: "6349a3f9164d00001c6c80da",
      postgresUrl: "postgres://user:pass@host/db",
      revalidateSecret: "my-secret-key",
      syncId: "12345",
    };

    const sanitized = sanitizeLogValue(context) as Record<string, unknown>;
    expect(sanitized.catalogId).toBe("6349a3f9164d00001c6c80da");
    expect(sanitized.syncId).toBe("12345");
    expect(sanitized.postgresUrl).toBe("[REDACTED]");
    expect(sanitized.revalidateSecret).toBe("[REDACTED]");
  });

  it("enables browser-extension error filtering in Honeybadger browser config", async () => {
    const { config } = await import("../../honeybadger.browser.config");
    expect(config.ignoreBrowserExtensionErrors).toBe(true);
  });
});
