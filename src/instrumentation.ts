import { captureRequestError } from "@honeybadger-io/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../honeybadger.server.config.js");
  }
}

export const onRequestError = captureRequestError;
