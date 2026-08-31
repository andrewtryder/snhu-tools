"use client";

import { useEffect } from "react";
import { Honeybadger } from "@honeybadger-io/react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export default function TransfersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Transfers Error]", error);
    try {
      Honeybadger.notify(error);
    } catch {
      // Ignore Honeybadger notification failures in tests/local dev
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[var(--spacing-container-max)] flex-1 items-center justify-center px-4 py-10 pb-52 md:px-8 md:pb-32"
      >
        <div
          role="alert"
          className="w-full max-w-md rounded-lg border border-error-container bg-error-container/20 p-8 text-center"
        >
          <h2 className="mb-2 font-[family-name:var(--font-headline)] text-2xl font-semibold text-error">
            Something went wrong
          </h2>
          <p className="mb-8 text-sm text-on-surface-variant">
            We encountered an error while trying to load the transfer list. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Try again
          </button>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
