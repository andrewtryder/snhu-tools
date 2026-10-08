import { NextResponse } from "next/server";
import { withPoolClient } from "@/features/courses/db/pool";
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
    const row = await withPoolClient(async (client) => {
      const result = await client.sql`
        SELECT title, pid, catalog_course_id, description, academic_level,
               credits, date_start, online_offering, campus_offering, subject_code
        FROM courses_data
        WHERE catalog_course_id = ${id}
      `;
      return result.rows[0] ?? null;
    });

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
