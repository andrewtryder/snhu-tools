import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { searchAll } from "@/lib/search/globalSearch";
import { BookOpen, GraduationCap, ArrowRightLeft, Search, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const title = query ? `Search: "${query}" | SNHU Tools` : "Search | SNHU Tools";

  return {
    title,
    description: "Search degree programs, course descriptions, and transfer course options across SNHU Tools.",
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const isShortQuery = query.length < 2;
  const searchData = isShortQuery ? null : await searchAll(query, { limit: 15 });

  const hasAnyResults =
    searchData &&
    (searchData.results.programs.length > 0 ||
      searchData.results.courses.length > 0 ||
      searchData.results.transfers.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppHeader />

      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-[var(--spacing-container-max)] px-4 py-8 md:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">
              {query ? `Search Results for "${query}"` : "Search SNHU Tools"}
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Unified search across Degree Programs, Courses, and Transfer Options.
            </p>
          </div>

          {searchData?.unavailable && searchData.unavailable.length > 0 && (
            <div
              role="status"
              className="mb-6 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Some search results are temporarily unavailable.</span>
            </div>
          )}

          {isShortQuery ? (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-outline" />
              <p className="text-base font-medium text-on-surface">
                Enter at least 2 characters to search SNHU Tools.
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Search by program title (e.g. Accounting), course code (e.g. CS210), or transfer options.
              </p>
            </div>
          ) : !hasAnyResults ? (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-outline" />
              <p className="text-base font-medium text-on-surface">
                No matching results found for &ldquo;{query}&rdquo;.
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Try searching for a course code like &ldquo;CS210&rdquo;, a major like &ldquo;Computer Science&rdquo;, or a subject prefix.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {/* Programs Section */}
              <section aria-labelledby="heading-programs">
                <div className="mb-4 flex items-center gap-2 border-b border-surface-variant pb-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <h2 id="heading-programs" className="text-lg font-semibold text-on-surface">
                    Degree Programs
                  </h2>
                  <span className="ml-auto rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                    {searchData.results.programs.length}
                  </span>
                </div>

                {searchData.results.programs.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No matching programs found.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {searchData.results.programs.map((prog) => (
                      <Link
                        key={prog.id}
                        href={prog.href}
                        className="group flex flex-col justify-between rounded-lg border border-surface-variant bg-surface-container-lowest p-4 transition-all hover:border-primary/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <div>
                          <span className="inline-block rounded-xs bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            Program
                          </span>
                          <h3 className="mt-2 text-base font-semibold text-on-surface group-hover:text-primary">
                            {prog.title}
                          </h3>
                        </div>
                        {prog.subtitle && (
                          <p className="mt-3 text-xs text-on-surface-variant font-medium">
                            {prog.subtitle}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Courses Section */}
              <section aria-labelledby="heading-courses">
                <div className="mb-4 flex items-center gap-2 border-b border-surface-variant pb-2">
                  <BookOpen className="h-5 w-5 text-secondary" />
                  <h2 id="heading-courses" className="text-lg font-semibold text-on-surface">
                    Courses
                  </h2>
                  <span className="ml-auto rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                    {searchData.results.courses.length}
                  </span>
                </div>

                {searchData.results.courses.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No matching courses found.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {searchData.results.courses.map((course) => (
                      <Link
                        key={course.id}
                        href={course.href}
                        className="group flex flex-col justify-between rounded-lg border border-surface-variant bg-surface-container-lowest p-4 transition-all hover:border-secondary/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-block rounded-xs bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
                              Course
                            </span>
                            <span className="font-mono text-xs font-bold text-on-surface">
                              {course.title}
                            </span>
                          </div>
                          {course.subtitle && (
                            <h3 className="mt-2 text-sm font-medium text-on-surface group-hover:text-secondary">
                              {course.subtitle}
                            </h3>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Transfer Options Section */}
              <section aria-labelledby="heading-transfers">
                <div className="mb-4 flex items-center gap-2 border-b border-surface-variant pb-2">
                  <ArrowRightLeft className="h-5 w-5 text-tertiary" />
                  <h2 id="heading-transfers" className="text-lg font-semibold text-on-surface">
                    Transfer Options
                  </h2>
                  <span className="ml-auto rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                    {searchData.results.transfers.length}
                  </span>
                </div>

                {searchData.results.transfers.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No matching transfer options found.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {searchData.results.transfers.map((trans) => (
                      <Link
                        key={trans.id}
                        href={trans.href}
                        className="group flex flex-col justify-between rounded-lg border border-surface-variant bg-surface-container-lowest p-4 transition-all hover:border-tertiary/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-block rounded-xs bg-tertiary/10 px-2 py-0.5 text-xs font-semibold text-tertiary">
                              Transfer
                            </span>
                            <span className="font-mono text-xs font-bold text-on-surface">
                              {trans.title}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-on-surface group-hover:text-tertiary">
                            {trans.subtitle}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
