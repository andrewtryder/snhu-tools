import Honeybadger from "@honeybadger-io/js";
import { captureRouterTransitionStart } from "@honeybadger-io/nextjs";

export const config = {
  apiKey: process.env.NEXT_PUBLIC_HONEYBADGER_API_KEY,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  revision: process.env.NEXT_PUBLIC_HONEYBADGER_REVISION,
  ignoreBrowserExtensionErrors: true,
};

Honeybadger.configure(config);
Honeybadger.logger.debug("Honeybadger configured for browser");

export const onRouterTransitionStart = captureRouterTransitionStart;
