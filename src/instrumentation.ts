/**
 * Next.js instrumentation.
 *
 * Honeybadger App Router reporting is owned by the official error boundaries
 * (error.tsx / global-error.tsx) plus syncReporting for writer pipelines.
 * Do NOT notify from onRequestError — that path produced the
 * nextjs#onRequestError flood (including quota-exceeded notification loops)
 * and duplicated notices already submitted via the client boundaries.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../honeybadger.server.config.js");
  }
}
