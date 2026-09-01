import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourseDetailDrawer } from "@/components/graph/CourseDetailDrawer";
import type { CourseNodeData } from "@/types/program";

const failedCourse: CourseNodeData = {
  id: "PSY300",
  code: "PSY 300",
  title: "Research Methods",
  credits: 3,
  groupCode: "major",
  groupName: "Major Courses",
  groupCategory: "major",
  prerequisites: [],
  corequisites: ["MAT240"],
  resolutionStatus: "failed",
};

const corequisite: CourseNodeData = {
  id: "MAT240",
  code: "MAT 240",
  title: "Applied Statistics",
  credits: 3,
  groupCode: "external",
  groupName: "External Prerequisites",
  groupCategory: "other",
  isExternal: true,
  resolutionStatus: "unavailable",
};

const prereqCourse: CourseNodeData = {
  id: "CS110",
  code: "CS 110",
  title: "Intro",
  credits: 3,
  groupCode: "major",
  groupName: "Complete all of the following",
  groupCategory: "major",
};

const courseWithPrereq: CourseNodeData = {
  id: "CS210",
  code: "CS 210",
  title: "Programming",
  credits: 3,
  groupCode: "major",
  groupName: "Major Courses",
  groupCategory: "major",
  prerequisites: ["CS110"],
  resolutionStatus: "resolved",
};

describe("CourseDetailDrawer relationship uncertainty", () => {
  it("separates corequisites and never calls an unresolved course a starting course", () => {
    render(<CourseDetailDrawer course={failedCourse} onClose={() => undefined} allCourses={[failedCourse, corequisite]} />);

    expect(screen.getByText(/Catalog course details could not be resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct Corequisites \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("MAT 240")).toBeInTheDocument();
    expect(screen.getByText(/Prerequisite relationships are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Starting course open for direct enrollment/i)).not.toBeInTheDocument();
  });

  it("does not render requirement-status or group-name badges", () => {
    render(
      <CourseDetailDrawer
        course={courseWithPrereq}
        onClose={() => undefined}
        allCourses={[courseWithPrereq, prereqCourse]}
      />,
    );

    expect(screen.queryByText("Major Courses")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete all of the following")).not.toBeInTheDocument();
    expect(screen.queryByText("Degree Requirement Note:")).not.toBeInTheDocument();
    expect(screen.getByText("CS 110")).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
  });

  it("uses local Courses and Transfers routes", () => {
    render(<CourseDetailDrawer course={courseWithPrereq} onClose={() => undefined} />);

    expect(screen.getByRole("link", { name: "View course details" })).toHaveAttribute(
      "href",
      "/courses/CS210",
    );
    expect(screen.getByRole("link", { name: "View transfer listings" })).toHaveAttribute(
      "href",
      "/transfers/courses/cs-210",
    );
    expect(screen.getByRole("link", { name: "View course details" })).not.toHaveAttribute("target", "_blank");
  });
});
