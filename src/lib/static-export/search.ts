import type { CoursesExport } from "./courses";
import type { ProgramsExport } from "./programs";
import type { TransfersExport } from "./transfers";
import { isValidTransferCourseCode } from "@/features/transfers/lib/courseCode";

export type SearchExport = { meta:{domain:"search";counts:{entries:number}}; programs:ProgramsExport["directory"]; courses:CoursesExport["summaries"]; transfers:TransfersExport["rows"] };
const transferKey=(row:TransfersExport["rows"][number])=>[row.courseNumber,row.subjectPrefix,row.groupFilter2Name,row.pid,row.coursePID,row.title,row.eligibilityTimeframe,row.academicLevel].map(value=>value??"").join("\0");

/** Builds a lossless index only from validated domain exports; it has no database or network dependency. */
export function transformSearch(programs:ProgramsExport,courses:CoursesExport,transfers:TransfersExport):SearchExport {
  if(programs.meta.domain!=="programs"||courses.meta.domain!=="courses"||transfers.meta.domain!=="transfers") throw new Error("Search sources have invalid domains");
  if(!programs.directory.length||!courses.summaries.length||!transfers.rows.length) throw new Error("Search sources must be non-empty");
  if(programs.directory.length!==programs.meta.counts.programs||courses.ids.length!==courses.meta.counts.ids||transfers.rows.length!==transfers.meta.counts.rows) throw new Error("Search source counts are inconsistent");
  const programSlugs=new Set<string>(); for(const program of programs.directory){if(!program.slug||!program.title||!programs.bySlug[program.slug]||programSlugs.has(program.slug)) throw new Error(`Invalid program search source: ${program.slug}`);programSlugs.add(program.slug);}
  const courseIds=new Set<string>(); for(const course of courses.summaries){if(!course.catalog_course_id||!course.title||!courses.records[course.catalog_course_id]||courseIds.has(course.catalog_course_id)) throw new Error(`Invalid course search source: ${course.catalog_course_id}`);courseIds.add(course.catalog_course_id);}
  for(const row of transfers.rows) if(!row.courseNumber||!isValidTransferCourseCode(row.courseNumber)) throw new Error("Invalid transfer search source");
  const programEntries=[...programs.directory].sort((a,b)=>a.title.localeCompare(b.title)||a.slug.localeCompare(b.slug));
  const courseEntries=[...courses.summaries].sort((a,b)=>a.catalog_course_id.localeCompare(b.catalog_course_id));
  const transferEntries=[...transfers.rows].sort((a,b)=>transferKey(a).localeCompare(transferKey(b)));
  return {meta:{domain:"search",counts:{entries:programEntries.length+courseEntries.length+transferEntries.length}},programs:programEntries,courses:courseEntries,transfers:transferEntries};
}
