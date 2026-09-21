import { NextResponse } from "next/server";
import { searchPrograms } from "@/lib/serverData";
import { SEARCH_CACHE_CONTROL } from "@/lib/search/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limitParam = searchParams.get("limit");
  const levelParam = searchParams.get("level") || undefined;

  if (q.trim().length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 30) : 15;

  try {
    const results = await searchPrograms(q, { limit, level: levelParam });
    return NextResponse.json(
      { results, query: q, count: results.length },
      { headers: { "Cache-Control": SEARCH_CACHE_CONTROL } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Search error: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
