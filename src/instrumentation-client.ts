import Honeybadger from "@honeybadger-io/js";
import { captureRouterTransitionStart } from "@honeybadger-io/nextjs";

export interface ClientNoticeLike {
  name?: string;
  message?: string;
  originalError?: unknown;
  context?: Record<string, unknown>;
}

export function shouldReportClientNotice(
  notice: ClientNoticeLike | undefined,
  userAgent?: string,
): boolean {
  if (!notice) {
    return false;
  }

  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/Lightpanda/i.test(ua)) {
    return false;
  }

  const message = typeof notice.message === "string" ? notice.message : "";
  const name = typeof notice.name === "string" ? notice.name : "";

  if (
    name === "ChunkLoadError" ||
    /failed to load chunk/i.test(message) ||
    /loading chunk/i.test(message)
  ) {
    return false;
  }

  if (
    message.includes('{"isTrusted":true}') ||
    (typeof (notice.originalError as { isTrusted?: unknown } | null | undefined)?.isTrusted === "boolean")
  ) {
    return false;
  }

  return true;
}

export const config = {
  apiKey: process.env.NEXT_PUBLIC_HONEYBADGER_API_KEY,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  revision: process.env.NEXT_PUBLIC_HONEYBADGER_REVISION,
  ignoreBrowserExtensionErrors: true,
};

Honeybadger.configure(config);
Honeybadger.beforeNotify((notice) => shouldReportClientNotice(notice));
Honeybadger.logger.debug("Honeybadger configured for browser");

export const onRouterTransitionStart = captureRouterTransitionStart;
