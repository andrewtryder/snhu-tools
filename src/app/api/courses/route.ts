import { NextResponse } from "next/server";
import { getAllCourseIds } from "@/features/courses/lib/courses";
import { parseCourseIdList } from "@/features/courses/lib/courseIds";
import {
  COURSE_API_ERROR_HEADERS,
  COURSE_API_SUCCESS_HEADERS,
} from "@/features/courses/lib/cacheHeaders";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json(
      { error: "No ids provided" },
      { status: 400, headers: COURSE_API_ERROR_HEADERS },
    );
  }

  const parsed = parseCourseIdList(idsParam);

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        error: parsed.errors.map((e) => e.message).join(" "),
        errors: parsed.errors,
      },
      { status: 400, headers: COURSE_API_ERROR_HEADERS },
    );
  }

  const ids = parsed.ids;

  try {
    const available = new Set(await getAllCourseIds());
    const rows = ids.filter((id) => available.has(id)).map((catalog_course_id) => ({ catalog_course_id }));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Classes not found." },
        { status: 404, headers: COURSE_API_ERROR_HEADERS },
      );
    }

    return NextResponse.json(rows, { headers: COURSE_API_SUCCESS_HEADERS });
  } catch (e) {
    console.error("Error fetching courses", e);
    return NextResponse.json(
      { error: "Failed to fetch courses." },
      { status: 500, headers: COURSE_API_ERROR_HEADERS },
    );
  }
}
