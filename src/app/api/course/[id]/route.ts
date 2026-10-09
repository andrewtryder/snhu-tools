import { NextResponse } from "next/server";
import { getCourseById } from "@/features/courses/lib/courses";
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
    const row = await getCourseById(id);

    if (!row) {
      return NextResponse.json(
        { error: `Class ID '${id}' not found.` },
        { status: 404, headers: COURSE_API_ERROR_HEADERS },
      );
    }

    return NextResponse.json(row, { headers: COURSE_API_SUCCESS_HEADERS });
  } catch (e) {
    console.error("Error fetching course", e);
    return NextResponse.json(
      { error: "Failed to fetch course." },
      { status: 500, headers: COURSE_API_ERROR_HEADERS },
    );
  }
}
