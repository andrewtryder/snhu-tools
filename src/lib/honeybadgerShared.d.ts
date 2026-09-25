/** Shared Honeybadger enablement + transport-noise filters. */

export function isProductionRuntime(): boolean;

/** Server/edge/sync: requires HONEYBADGER_ENABLED=true AND production. */
export function isHoneybadgerEnabled(): boolean;

/**
 * Browser (error boundaries / browser config): requires
 * NEXT_PUBLIC_HONEYBADGER_ENABLED=true AND production.
 */
export function isHoneybadgerBrowserEnabled(): boolean;

/** True when the value looks like a Honeybadger quota/transport failure. */
export function isHoneybadgerTransportNoise(value: unknown): boolean;
