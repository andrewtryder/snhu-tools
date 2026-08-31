import Link from "next/link";
import { GITHUB_REPO_URL } from "@/lib/snhuTools";

export function formatCatalogLastUpdated(lastUpdated: Date | string | null): string {
  if (!lastUpdated) return "Not available";

  const parsedDate = lastUpdated instanceof Date ? lastUpdated : new Date(lastUpdated);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

const linkClassName =
  "text-on-surface-variant transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low rounded-sm";

export function AppFooter({ lastUpdated = null }: { lastUpdated?: Date | string | null }) {
  const formattedDate = formatCatalogLastUpdated(lastUpdated);

  return (
    <footer aria-label="Footer" className="mt-auto border-t border-surface-variant bg-surface-container-low">
      <div className="mx-auto w-full max-w-[var(--spacing-container-max)] px-4 py-4 md:px-8">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3 md:items-center">
          <p className="text-center text-sm text-on-surface-variant md:text-left">
            <span className="font-bold text-on-surface">Last Updated:</span> {formattedDate}
          </p>
          <p className="text-center text-sm text-on-surface-variant">
            <span className="font-bold text-on-surface">Disclaimer:</span> Unofficial SNHU site. Data is
            provided for informational purposes only. Confirm official requirements with SNHU where
            appropriate.
          </p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap justify-center gap-4 text-xs font-medium tracking-wide md:justify-end"
          >
            <Link href="/programs" className={linkClassName}>
              Programs
            </Link>
            <Link href="/courses" className={linkClassName}>
              Courses
            </Link>
            <Link href="/transfers" className={linkClassName}>
              Transfers
            </Link>
            <Link href="/about" className={linkClassName}>
              About
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              Source Code
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
