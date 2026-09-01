import Link from "next/link";
import { slugify, transferCoursePath } from "@/features/transfers/lib/slug";
import type { TransferRow } from "@/features/transfers/lib/seoQueries";

type EquivalencyTableProps = {
  rows: TransferRow[];
};

export function EquivalencyTable({ rows }: EquivalencyTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-variant bg-surface-container-lowest shadow-xs">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-variant">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Course
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Organization
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Timeframe
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant bg-surface-container-lowest">
            {rows.map((row, index) => {
              const courseValue = row.courseNumber || "-";
              const orgValue = row.groupFilter2Name || "Unknown Organization";
              const levelValue = row.academicLevel || "Unknown Level";
              const subjectValue = row.subjectPrefix || "Unknown Subject";

              return (
                <tr key={`${row.pid ?? "no-pid"}-${row.courseNumber ?? "no-course"}-${index}`}>
                  <td className="px-4 py-3 text-sm font-medium text-on-surface">
                    {row.courseNumber ? (
                      <Link
                        href={transferCoursePath(row.courseNumber)}
                        className="text-secondary transition-colors hover:text-primary hover:underline"
                      >
                        {courseValue}
                      </Link>
                    ) : (
                      courseValue
                    )}
                    {row.subjectPrefix && (
                      <div className="mt-1 text-xs text-on-surface-variant">
                        <Link
                          href={`/transfers/subjects/${slugify(subjectValue)}`}
                          className="hover:underline"
                        >
                          {subjectValue}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {row.pid ? (
                      <a
                        href={`https://www.snhu.edu/admission/transferring-credits/work-life-experience#/experiences/${row.pid}`}
                        className="text-secondary transition-colors hover:text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {row.title || "-"}
                      </a>
                    ) : (
                      row.title || "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {row.groupFilter2Name ? (
                      <Link
                        href={`/transfers/organizations/${slugify(orgValue)}`}
                        className="transition-colors hover:text-primary hover:underline"
                      >
                        {orgValue}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {row.academicLevel ? (
                      <Link
                        href={`/transfers/levels/${slugify(levelValue)}`}
                        className="transition-colors hover:text-primary hover:underline"
                      >
                        {levelValue}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {row.eligibilityTimeframe || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
