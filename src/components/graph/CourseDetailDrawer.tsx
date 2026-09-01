"use client";

import React from "react";
import Link from "next/link";
import { CourseNodeData } from "@/types/program";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { coursePath } from "@/features/courses/lib/courseIds";
import { transferCoursePath } from "@/features/transfers/lib/slug";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  LayersIcon,
  ArrowRightLeftIcon,
} from "lucide-react";

export interface CourseDetailDrawerProps {
  course: CourseNodeData | null;
  onClose: () => void;
  allCourses?: CourseNodeData[];
}

export function CourseDetailDrawer({ course, onClose, allCourses = [] }: CourseDetailDrawerProps) {
  if (!course) return null;

  const coursesUrl = course.code.trim() ? coursePath(course.code) : null;
  const transferUrl = course.code.trim() ? transferCoursePath(course.code) : null;

  const prereqCourses = (course.prerequisites || [])
    .map((id) => allCourses.find((c) => c.id === id || c.code === id))
    .filter(Boolean) as CourseNodeData[];
  const coreqCourses = (course.corequisites || [])
    .map((id) => allCourses.find((c) => c.id === id || c.code === id))
    .filter(Boolean) as CourseNodeData[];

  const unlockedCourses = allCourses.filter(
    (c) => (c.prerequisites || []).includes(course.id) || (c.prerequisites || []).includes(course.code),
  );

  return (
    <Dialog
      isOpen={Boolean(course)}
      onClose={onClose}
      title={`${course.code}: ${course.title}`}
      description={`${course.credits == null ? "Credits not specified" : `${course.credits} Credits`}`}
      maxWidth="md"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {course.isPlaceholder && <Badge variant="outline">Elective Placeholder</Badge>}
            {course.isExternal && <Badge variant="outline">External prerequisite</Badge>}
            {course.resolutionStatus && course.resolutionStatus !== "resolved" && !course.isExternal && (
              <Badge variant="outline">Catalog details unavailable</Badge>
            )}
            <Badge variant="neutral">
              {course.credits == null ? "Credits not specified" : `${course.credits} Semester Credits`}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {coursesUrl && (
              <Link
                href={coursesUrl}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View course details
              </Link>
            )}
          </div>
        </div>

        {course.resolutionStatus && course.resolutionStatus !== "resolved" && !course.isExternal && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Catalog course details could not be resolved, so prerequisite relationships may be incomplete. Verify this
            course with SNHU before planning enrollment.
          </div>
        )}

        {transferUrl && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
            <Link
              href={transferUrl}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-900 hover:underline"
            >
              <ArrowRightLeftIcon className="h-4 w-4 text-emerald-700" />
              View transfer listings
            </Link>
            <p className="mt-1.5 text-[11px] text-emerald-800">
              Transfer course evaluations require official review and approval by SNHU.
            </p>
          </div>
        )}

        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <BookOpenIcon className="h-4 w-4" /> Course Description
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-on-surface">
            {course.description || "No official description available in catalog record."}
          </p>
        </div>

        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <LayersIcon className="h-4 w-4" /> Direct Prerequisites ({prereqCourses.length})
          </h4>
          {prereqCourses.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {prereqCourses.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-variant bg-surface-container-low p-2.5 text-xs"
                >
                  <span className="font-bold text-primary">{req.code}</span>
                  <span className="text-on-surface">{req.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs italic text-on-surface-variant">
              {(course.resolutionStatus || "resolved") === "resolved"
                ? "No catalog prerequisite links were identified. Verify enrollment requirements with SNHU."
                : "Prerequisite relationships are unavailable until catalog course details can be resolved."}
            </p>
          )}
        </div>

        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <ArrowRightLeftIcon className="h-4 w-4" /> Direct Corequisites ({coreqCourses.length})
          </h4>
          {coreqCourses.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {coreqCourses.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-variant bg-surface-container-low p-2.5 text-xs"
                >
                  <span className="font-bold text-primary">{req.code}</span>
                  <span className="text-on-surface">{req.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs italic text-on-surface-variant">No catalog corequisite links were identified.</p>
          )}
        </div>

        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <CheckCircle2Icon className="h-4 w-4 text-tertiary" /> Downstream Dependents ({unlockedCourses.length})
          </h4>
          {unlockedCourses.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {unlockedCourses.map((next) => (
                <li
                  key={next.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-variant bg-surface-container-low p-2.5 text-xs"
                >
                  <span className="font-bold text-primary">{next.code}</span>
                  <span className="text-on-surface">{next.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs italic text-on-surface-variant">
              Does not act as a prerequisite for downstream core courses in this degree map.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
