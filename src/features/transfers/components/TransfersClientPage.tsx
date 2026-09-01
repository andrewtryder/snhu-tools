"use client";

import React, { useState, useMemo, useDeferredValue, KeyboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  BookOpenIcon,
  BuildingIcon,
  GraduationCapIcon,
} from "lucide-react";
import type { FacetSummary } from "@/features/transfers/lib/seoQueries";
import { slugify, transferCoursePath } from "@/features/transfers/lib/slug";

export type ViewType = "subject" | "organization" | "level";

export type TransferCourseItem = {
  subjectPrefix: string | null;
  courseNumber: string | null;
  title: string | null;
  pid: string | null;
  eligibilityTimeframe: string | null;
  groupFilter2Name: string | null;
  academicLevel: string | null;
  coursePID: string | null;
  courseName?: string | null;
  searchString?: string;
};

export type TransferCoursesByGroup = {
  [groupName: string]: TransferCourseItem[];
};

export type TransferCoursesData = {
  [subjectPrefix: string]: TransferCoursesByGroup;
};

export type TransferSeoFacets = {
  subjects: FacetSummary[];
  organizations: FacetSummary[];
  levels: FacetSummary[];
  courses: FacetSummary[];
};

const tabBaseClass =
  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors md:flex-none";
const tabActiveClass = "bg-surface-container-lowest text-primary shadow-xs font-semibold";
const tabInactiveClass = "text-on-surface-variant hover:text-on-surface";

const searchInputClassName =
  "w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-4 text-sm text-on-surface shadow-xs outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

export function TransfersClientPage({
  initialCoursesData,
  seoFacets,
}: {
  initialCoursesData: TransferCoursesData;
  seoFacets: TransferSeoFacets;
}) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [activeView, setActiveView] = useState<ViewType>("subject");

  const allCourses = useMemo(() => {
    const courses: TransferCourseItem[] = [];
    for (const prefix of Object.values(initialCoursesData)) {
      for (const courseList of Object.values(prefix)) {
        for (const course of courseList) {
          const courseCode = course.courseNumber || course.courseName || "";
          const subject = course.subjectPrefix || "";
          const title = course.title || "";
          const org = course.groupFilter2Name || "";
          courses.push({
            ...course,
            searchString: `${courseCode} ${subject} ${title} ${org}`.toLowerCase(),
          });
        }
      }
    }
    return courses;
  }, [initialCoursesData]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleRow(id);
    }
  };

  const groupedAndFilteredCourses = useMemo(() => {
    const searchLower = deferredSearchTerm.toLowerCase();

    const filtered = allCourses.filter(
      (course) => course.searchString?.includes(searchLower)
    );

    const grouped: Record<string, TransferCourseItem[]> = {};

    filtered.forEach((course) => {
      let key = "";
      if (activeView === "subject") {
        key = course.subjectPrefix || "Unknown Subject";
      } else if (activeView === "organization") {
        key = course.groupFilter2Name || "Unknown Organization";
      } else if (activeView === "level") {
        key = course.academicLevel || "Unknown Level";
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(course);
    });

    return Object.keys(grouped)
      .sort()
      .map((key) => ({
        groupName: key,
        coursesList: grouped[key],
      }));
  }, [allCourses, deferredSearchTerm, activeView]);

  return (
    <div className="flex flex-col gap-6">
      {/* Transfer Search & Grouping Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0 max-w-xl">
          <SearchIcon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/70"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Search transfer equivalencies"
            className={searchInputClassName}
            placeholder="Search by course (e.g. CS110), title, or provider..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div
          className="flex overflow-x-auto rounded-lg border border-surface-variant bg-surface-container p-1"
          role="tablist"
          aria-label="Group results by"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "subject"}
            onClick={() => setActiveView("subject")}
            className={`${tabBaseClass} ${activeView === "subject" ? tabActiveClass : tabInactiveClass}`}
          >
            <BookOpenIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">By Subject</span>
            <span className="sm:hidden">Subject</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "organization"}
            onClick={() => setActiveView("organization")}
            className={`${tabBaseClass} ${activeView === "organization" ? tabActiveClass : tabInactiveClass}`}
          >
            <BuildingIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">By Organization</span>
            <span className="sm:hidden">Org</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "level"}
            onClick={() => setActiveView("level")}
            className={`${tabBaseClass} ${activeView === "level" ? tabActiveClass : tabInactiveClass}`}
          >
            <GraduationCapIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">By Level</span>
            <span className="sm:hidden">Level</span>
          </button>
        </div>
      </div>

      {/* Hero Overview & Directory Facets */}
      <section className="rounded-lg border border-surface-variant bg-surface-container-low p-5">
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold text-primary md:text-3xl">
          SNHU Transfer Equivalency List
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant md:text-base">
          Search unofficial SNHU transfer equivalencies by course, provider, subject, and academic level.
          Browse crawlable directory links below for popular topics, or use the interactive table to filter
          details.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Top Subjects</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {seoFacets.subjects.slice(0, 8).map((item) => (
                <li key={`subject-${item.slug}`}>
                  <Link
                    href={`/transfers/subjects/${item.slug}`}
                    className="hover:text-primary hover:underline"
                  >
                    {item.value} ({item.count})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Top Organizations</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {seoFacets.organizations.slice(0, 8).map((item) => (
                <li key={`org-${item.slug}`}>
                  <Link
                    href={`/transfers/organizations/${item.slug}`}
                    className="hover:text-primary hover:underline"
                  >
                    {item.value} ({item.count})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Academic Levels</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {seoFacets.levels.slice(0, 8).map((item) => (
                <li key={`level-${item.slug}`}>
                  <Link
                    href={`/transfers/levels/${item.slug}`}
                    className="hover:text-primary hover:underline"
                  >
                    {item.value} ({item.count})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Popular Courses</h2>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {seoFacets.courses.slice(0, 8).map((item) => (
                <li key={`course-${item.slug}`}>
                  <Link
                    href={`/transfers/courses/${item.slug}`}
                    className="hover:text-primary hover:underline"
                  >
                    {item.value} ({item.count})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-5 text-xs text-on-surface-variant">
          <strong className="text-on-surface">Disclaimer:</strong> This is an unofficial compilation.
          Remember to double-check the official SNHU website for transfer eligibility, and always verify with your advisor.
        </p>
      </section>

      {/* Interactive Table */}
      <div className="overflow-hidden rounded-lg border border-surface-variant bg-surface-container-lowest shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-variant">
            <thead className="bg-surface-container-low">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                >
                  Group
                </th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant bg-surface-container-lowest">
              {groupedAndFilteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-on-surface-variant">
                    No courses found matching your search.
                  </td>
                </tr>
              ) : (
                groupedAndFilteredCourses.map(({ groupName, coursesList }) => {
                  const rowId = groupName;
                  const isExpanded = expandedRows[rowId];

                  return (
                    <React.Fragment key={rowId}>
                      <tr
                        className="group cursor-pointer transition-colors hover:bg-surface-container-low"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => handleKeyDown(e, rowId)}
                        onClick={() => toggleRow(rowId)}
                      >
                        <td colSpan={2} className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center font-semibold text-on-surface">
                            <span className="mr-3 text-outline transition-colors group-hover:text-primary">
                              {isExpanded ? (
                                <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                              )}
                            </span>
                            <span className="text-base">{groupName}</span>
                            <span className="ml-3 inline-flex items-center rounded-full border border-surface-variant bg-surface-container-low px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
                              {coursesList.length} {coursesList.length === 1 ? "item" : "items"}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-surface-container-low/60">
                          <td colSpan={2} className="border-b-0 p-0">
                            <div className="px-6 py-4 md:px-14">
                              <div className="overflow-hidden rounded-lg border border-surface-variant bg-surface-container-lowest shadow-xs">
                                <table className="min-w-full divide-y divide-surface-variant">
                                  <thead className="bg-surface-container-low">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant">
                                        Course
                                      </th>
                                      {activeView !== "organization" && (
                                        <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant">
                                          Organization
                                        </th>
                                      )}
                                      <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant">
                                        Title
                                      </th>
                                      {activeView !== "level" && (
                                        <th className="hidden px-4 py-3 text-left text-xs font-medium text-on-surface-variant sm:table-cell">
                                          Level
                                        </th>
                                      )}
                                      <th className="hidden px-4 py-3 text-left text-xs font-medium text-on-surface-variant md:table-cell">
                                        Timeframe
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-variant">
                                    {coursesList.map((course, idx) => {
                                      const courseCode =
                                        course.courseNumber || course.courseName;
                                      const orgName = course.groupFilter2Name;
                                      const levelName = course.academicLevel;

                                      return (
                                        <tr
                                          key={`${rowId}-${idx}`}
                                          className="transition-colors hover:bg-surface-container-low"
                                        >
                                          <td className="px-4 py-3 text-sm font-medium text-on-surface">
                                            {courseCode ? (
                                              <Link
                                                href={transferCoursePath(courseCode)}
                                                className="text-secondary transition-colors hover:text-primary hover:underline"
                                              >
                                                {courseCode}
                                              </Link>
                                            ) : (
                                              "-"
                                            )}
                                          </td>
                                          {activeView !== "organization" && (
                                            <td className="px-4 py-3 text-sm text-on-surface-variant">
                                              {orgName ? (
                                                <Link
                                                  href={`/transfers/organizations/${slugify(orgName)}`}
                                                  className="transition-colors hover:text-primary hover:underline"
                                                >
                                                  {orgName}
                                                </Link>
                                              ) : (
                                                "-"
                                              )}
                                            </td>
                                          )}
                                          <td className="px-4 py-3 text-sm text-on-surface">
                                            {course.pid ? (
                                              <a
                                                href={`https://www.snhu.edu/admission/transferring-credits/work-life-experience#/experiences/${course.pid}`}
                                                className="font-medium text-secondary transition-colors hover:text-primary hover:underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                {course.title || "-"}
                                              </a>
                                            ) : (
                                              <span className="font-medium">
                                                {course.title || "-"}
                                              </span>
                                            )}
                                          </td>
                                          {activeView !== "level" && (
                                            <td className="hidden px-4 py-3 text-sm text-on-surface-variant sm:table-cell">
                                              {levelName ? (
                                                <Link
                                                  href={`/transfers/levels/${slugify(levelName)}`}
                                                  className="inline-flex items-center rounded-full border border-surface-variant bg-surface-container-low px-2 py-0.5 text-xs font-medium text-on-surface transition-colors hover:text-primary"
                                                >
                                                  {levelName}
                                                </Link>
                                              ) : (
                                                "-"
                                              )}
                                            </td>
                                          )}
                                          <td className="hidden px-4 py-3 text-sm text-on-surface-variant md:table-cell">
                                            {course.eligibilityTimeframe || "-"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
