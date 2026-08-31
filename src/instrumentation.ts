import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../honeybadger.server.config.js");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const Honeybadger = (await import("@honeybadger-io/js")).default;
      if (Honeybadger.config.apiKey) {
        await Honeybadger.notifyAsync(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: "nextjs",
            action: "onRequestError",
            context: {
              path: request.path,
              method: request.method,
              routerKind: context.routerKind,
              routePath: context.routePath,
              routeType: context.routeType,
            },
            tags: "nextjs,onRequestError",
          }
        );
      }
    } catch {
      // Monitoring must never break application request handling.
    }
  }
};
