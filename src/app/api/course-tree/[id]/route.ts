import { NextResponse } from "next/server";
import { getCourseTree } from "@/features/courses/lib/courses";
import {
  COURSE_API_ERROR_HEADERS,
  COURSE_API_SUCCESS_HEADERS,
} from "@/features/courses/lib/cacheHeaders";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = resolvedParams.id.toUpperCase();

  try {
    const tree = await getCourseTree(id);
    if (!tree) {
      return NextResponse.json(
        { error: `Class ID '${id}' not found.` },
        { status: 404, headers: COURSE_API_ERROR_HEADERS },
      );
    }

    return NextResponse.json(tree, { headers: COURSE_API_SUCCESS_HEADERS });
  } catch (e) {
    console.error("Error generating course tree", e);
    return NextResponse.json(
      { error: "Failed to generate course tree." },
      { status: 500, headers: COURSE_API_ERROR_HEADERS },
    );
  }
}
