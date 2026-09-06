"use client";

import { Suspense } from "react";
import { CourseExplorerClient } from "./CourseExplorerClient";

/**
 * Wraps CourseExplorerClient in a Suspense boundary.
 *
 * Next.js requires a Suspense boundary around components that call
 * useSearchParams() when their parent page is statically rendered
 * (revalidate=false or ISR). Without this shell, the build fails with:
 *
 *   "useSearchParams() should be wrapped in a suspense boundary at the
 *    page level"
 *
 * This shell lets /courses/page.tsx remain fully static while the
 * explorer reads ?ids= from the URL on the client after hydration.
 */
export function CourseExplorerShell() {
  return (
    <Suspense>
      <CourseExplorerClient />
    </Suspense>
  );
}
