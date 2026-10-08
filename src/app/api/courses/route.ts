import { NextResponse } from "next/server";
import { withPoolClient } from "@/features/courses/db/pool";
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
    const rows = await withPoolClient(async (client) => {
      const result = await client.query(
        `SELECT catalog_course_id
         FROM courses_data
         WHERE catalog_course_id = ANY($1)`,
        [ids],
      );
      return result.rows;
    });

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
