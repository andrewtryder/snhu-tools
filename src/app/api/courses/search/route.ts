import { NextResponse } from "next/server";
import { searchCourses } from "@/features/courses/lib/searchCourses";
import { SEARCH_CACHE_CONTROL, SEARCH_DEGRADED_CACHE_CONTROL } from "@/lib/search/cache";
import { isDbAvailabilityError } from "@/lib/snapshots/availability";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const parsedLimit = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 10, 1), 25);

  if (query.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const rows = await searchCourses(query, { limit });
    return NextResponse.json(rows, {
      headers: { "Cache-Control": SEARCH_CACHE_CONTROL },
    });
  } catch (e) {
    console.error("Error searching courses", e);
    const degraded = isDbAvailabilityError(e);
    return NextResponse.json(
      { error: "Failed to search courses." },
      {
        status: 500,
        headers: {
          "Cache-Control": degraded ? SEARCH_DEGRADED_CACHE_CONTROL : "no-store",
        },
      },
    );
  }
}
