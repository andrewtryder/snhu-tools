import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Honeybadger enablement gate", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HONEYBADGER_ENABLED;
    delete process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED;
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.VITEST;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadGate() {
    return import("@/lib/honeybadgerShared.js");
  }

  it("disables when HONEYBADGER_ENABLED is missing", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const { isHoneybadgerEnabled } = await loadGate();
    expect(isHoneybadgerEnabled()).toBe(false);
  });

  it("disables when HONEYBADGER_ENABLED=false", async () => {
    process.env.HONEYBADGER_ENABLED = "false";
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const { isHoneybadgerEnabled } = await loadGate();
    expect(isHoneybadgerEnabled()).toBe(false);
  });

  it("disables in test / Vitest", async () => {
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED = "true";
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    const gate = await loadGate();
    expect(gate.isHoneybadgerEnabled()).toBe(false);
    expect(gate.isHoneybadgerBrowserEnabled()).toBe(false);
  });

  it("disables in development", async () => {
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED = "true";
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    const gate = await loadGate();
    expect(gate.isHoneybadgerEnabled()).toBe(false);
    expect(gate.isHoneybadgerBrowserEnabled()).toBe(false);
  });

  it("disables in Vercel preview", async () => {
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    const gate = await loadGate();
    expect(gate.isHoneybadgerEnabled()).toBe(false);
    expect(gate.isHoneybadgerBrowserEnabled()).toBe(false);
  });

  it("enables in Vercel production when flags are true", async () => {
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const gate = await loadGate();
    expect(gate.isHoneybadgerEnabled()).toBe(true);
    expect(gate.isHoneybadgerBrowserEnabled()).toBe(true);
  });

  it("treats quota-exceeded messages as transport noise", async () => {
    const { isHoneybadgerTransportNoise } = await loadGate();
    expect(
      isHoneybadgerTransportNoise(
        "Your account or project has exceeded the quota. Upgrade your plan to increase limits.",
      ),
    ).toBe(true);
    expect(isHoneybadgerTransportNoise(new Error("exceeded the quota"))).toBe(true);
    expect(isHoneybadgerTransportNoise(new Error("Failed query: select ..."))).toBe(false);
    expect(isHoneybadgerTransportNoise(new Error("Connection terminated unexpectedly"))).toBe(
      false,
    );
  });
});

describe("Honeybadger browser config flood safety", () => {
  it("keeps browser-extension filtering and a maxErrors cap", async () => {
    const { config } = await import("../../honeybadger.browser.config");
    expect(config.ignoreBrowserExtensionErrors).toBe(true);
    expect(config.maxErrors).toBe(10);
    expect(config.reportData).toBe(false);
  });
});

describe("instrumentation does not notify from onRequestError", () => {
  it("does not export onRequestError (avoids nextjs#onRequestError duplicates)", async () => {
    const instrumentation = await import("@/instrumentation");
    expect(instrumentation.onRequestError).toBeUndefined();
    expect(typeof instrumentation.register).toBe("function");
  });
});
