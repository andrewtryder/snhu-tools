/**
 * Shared Honeybadger enablement + transport-noise filters.
 * Plain JS so honeybadger.*.config.js can import it without transpilation.
 */

function isProductionRuntime() {
  const vercelEnv =
    process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv === "production";
  }
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

/** Server/edge/sync: requires HONEYBADGER_ENABLED=true AND production. */
export function isHoneybadgerEnabled() {
  return process.env.HONEYBADGER_ENABLED === "true" && isProductionRuntime();
}

/**
 * Browser (error boundaries / browser config): requires
 * NEXT_PUBLIC_HONEYBADGER_ENABLED=true AND production.
 */
export function isHoneybadgerBrowserEnabled() {
  return (
    process.env.NEXT_PUBLIC_HONEYBADGER_ENABLED === "true" &&
    isProductionRuntime()
  );
}

const TRANSPORT_NOISE =
  /exceeded the quota|upgrade your plan to increase limits/i;

/** True when the value looks like a Honeybadger quota/transport failure. */
export function isHoneybadgerTransportNoise(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return TRANSPORT_NOISE.test(value);
  }
  if (typeof value === "object") {
    const message = value.message || value.error || "";
    return TRANSPORT_NOISE.test(String(message));
  }
  return TRANSPORT_NOISE.test(String(value));
}

export { isProductionRuntime };
