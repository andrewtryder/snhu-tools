import Link from "next/link";
import { DegreeProgram } from "@/types/program";
import { Card } from "@/components/ui/Card";
import {
  getProgramTransferCoverage,
  type TransferCoverageCourse,
} from "@/lib/transferCoverage.server";
import { transferCoursePath } from "@/features/transfers/lib/slug";

const TRANSFER_COURSE_GRID_CLASS =
  "grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6";

const TRANSFER_COURSE_LINK_CLASS =
  "inline-flex h-7 items-center justify-center rounded-md border border-emerald-300 bg-white px-2 font-mono text-xs font-medium tabular-nums text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

function TransferCourseLink({ course }: { course: TransferCoverageCourse }) {
  return (
    <Link
      href={transferCoursePath(course.courseCode)}
      aria-label={`View transfer equivalencies for ${course.displayCourseCode}`}
      className={TRANSFER_COURSE_LINK_CLASS}
    >
      {course.displayCourseCode}
    </Link>
  );
}

function TransferCourseGrid({ courses }: { courses: TransferCoverageCourse[] }) {
  return (
    <div className={TRANSFER_COURSE_GRID_CLASS}>
      {courses.map((course) => (
        <TransferCourseLink key={course.courseCode} course={course} />
      ))}
    </div>
  );
}

export async function ProgramTransferCoverage({ program }: { program: DegreeProgram }) {
  const result = await getProgramTransferCoverage(program);

  if (result.status === "unavailable") {
    return (
      <Card className="min-h-[5.5rem] border-surface-variant space-y-2">
        <h2 className="text-sm font-bold text-on-surface">Transfer Integration</h2>
        <p className="text-xs text-on-surface-variant">
          Transfer-equivalency coverage is temporarily unavailable.
        </p>
      </Card>
    );
  }

  const matched = result.data.courses.filter((course) => course.hasTransferEquivalencies);

  return (
    <Card className="min-h-[5.5rem] border-emerald-200 bg-emerald-50/50 space-y-2">
      <h2 className="text-sm font-bold text-emerald-950">Transfer Integration</h2>

      <p className="text-xs text-emerald-900">
        {matched.length} of {result.data.requestedCourseCount} identified program courses have known
        transfer listings.
      </p>

      {matched.length > 0 ? (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-medium text-emerald-800/80">
            Courses with known transfer listings
          </p>
          <TransferCourseGrid courses={matched} />
        </div>
      ) : (
        <p className="text-xs text-emerald-900">
          No known transfer listings were found for the identified program courses.
        </p>
      )}
    </Card>
  );
}
