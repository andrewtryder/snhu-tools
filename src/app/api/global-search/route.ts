import { NextResponse } from "next/server";
import { searchAll } from "@/lib/search/globalSearch";
import { SEARCH_CACHE_CONTROL, SEARCH_DEGRADED_CACHE_CONTROL } from "@/lib/search/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const parsedLimit = parseInt(searchParams.get("limit") ?? "5", 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 5, 1), 10);

  if (q.length < 2) {
    return NextResponse.json({
      query: q,
      results: {
        programs: [],
        courses: [],
        transfers: [],
      },
      counts: {
        programs: 0,
        courses: 0,
        transfers: 0,
        total: 0,
      },
    });
  }

  try {
    const data = await searchAll(q, { limit });
    const cacheControl = data.degraded
      ? SEARCH_DEGRADED_CACHE_CONTROL
      : SEARCH_CACHE_CONTROL;
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": cacheControl,
      },
    });
  } catch (err) {
    console.error("[api/global-search] Unexpected error:", (err as Error).message);
    return NextResponse.json(
      { error: "Global search is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
