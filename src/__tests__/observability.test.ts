import { describe, it, expect } from "vitest";
import { sanitizeLogValue } from "@/lib/logSanitization";
import { shouldReportClientNotice } from "../instrumentation-client";

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
    const { config } = await import("../instrumentation-client");
    expect(config.ignoreBrowserExtensionErrors).toBe(true);
  });

  describe("Honeybadger client notice filter", () => {
    it("drops notices from Lightpanda user agents", () => {
      const notice = { name: "SyntaxError", message: "Invalid or unexpected token" };
      expect(shouldReportClientNotice(notice, "Lightpanda/1.0")).toBe(false);
    });

    it("drops ChunkLoadError by error name", () => {
      const notice = {
        name: "ChunkLoadError",
        message: "Failed to load chunk /_next/static/immutable/chunks/3ocbmb7g7s8x5.css from module 96777",
      };
      expect(shouldReportClientNotice(notice, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    });

    it("drops chunk loading error messages even if name differs", () => {
      const notice = {
        name: "Error",
        message: "Loading chunk 123 failed.",
      };
      expect(shouldReportClientNotice(notice)).toBe(false);
    });

    it("drops unhandled rejection warnings serialized as {\"isTrusted\":true}", () => {
      const notice = {
        name: "window.onunhandledrejection",
        message: 'UnhandledPromiseRejectionWarning: {"isTrusted":true}',
      };
      expect(shouldReportClientNotice(notice)).toBe(false);
    });

    it("drops notices where originalError is a DOM event with isTrusted", () => {
      const notice = {
        name: "Error",
        message: "Event fired",
        originalError: { isTrusted: true },
      };
      expect(shouldReportClientNotice(notice)).toBe(false);
    });

    it("retains legitimate application errors from regular user browsers", () => {
      const notice = {
        name: "TypeError",
        message: "Cannot read properties of undefined (reading 'title')",
      };
      expect(
        shouldReportClientNotice(
          notice,
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        ),
      ).toBe(true);
    });
  });
});
