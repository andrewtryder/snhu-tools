import { pgTable, serial, varchar, text } from "drizzle-orm/pg-core";

export const transferCourses = pgTable("transfer_courses", {
  id: serial("id").primaryKey(),
  subjectPrefix: varchar("subjectprefix", { length: 255 }),
  courseNumber: varchar("coursenumber", { length: 255 }),
  title: text("title"),
  pid: varchar("pid", { length: 255 }),
  eligibilityTimeframe: text("eligibilitytimeframe"),
  groupFilter2Name: varchar("groupfilter2name", { length: 255 }),
  academicLevel: varchar("academiclevel", { length: 255 }),
  coursePID: varchar("coursepid", { length: 255 }),
});
