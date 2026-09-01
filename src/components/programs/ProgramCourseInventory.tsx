import React from "react";
import Link from "next/link";
import { CourseNodeData } from "@/types/program";
import { buildCourseLookup, resolvePrerequisites } from "@/lib/coursePrerequisites";
import { coursePath } from "@/features/courses/lib/courseIds";

export function ProgramCourseInventory({ courses }: { courses: CourseNodeData[] }) {
  const byId = buildCourseLookup(courses);
  const listed = courses.filter((course) => !course.isPlaceholder);

  if (listed.length === 0) {
    return <p className="text-sm text-on-surface-variant">No resolved course listings are available for this program.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-variant">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Courses in this degree program with known prerequisite links</caption>
        <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Course
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Title
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Credits
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Prerequisites
            </th>
          </tr>
        </thead>
        <tbody>
          {listed.map((course) => {
            const prereqs = resolvePrerequisites(course, byId);
            const coursesUrl = course.code.trim() ? coursePath(course.code) : null;
            return (
              <tr key={course.id} className="border-t border-surface-variant">
                <th scope="row" className="px-3 py-2 font-mono font-semibold text-primary">
                  {coursesUrl ? (
                    <Link
                      href={coursesUrl}
                      className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {course.code}
                    </Link>
                  ) : (
                    course.code
                  )}
                  {course.isExternal ? (
                    <span className="ml-2 text-[11px] font-sans font-medium text-on-surface-variant">External</span>
                  ) : null}
                </th>
                <td className="px-3 py-2 text-on-surface">{course.title}</td>
                <td className="px-3 py-2 font-mono text-on-surface-variant">
                  {course.credits == null ? "—" : course.credits}
                </td>
                <td className="px-3 py-2 text-on-surface-variant">
                  {prereqs.length > 0 ? (
                    <ul className="space-y-1">
                      {prereqs.map((prerequisite) => (
                        <li key={prerequisite.code}>
                          <span className="font-mono">{prerequisite.code}</span>
                          {prerequisite.title ? ` — ${prerequisite.title}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "None listed"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
