import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/features/courses/lib/courses";
import { TRANSFER_CACHE_TAG } from "@/features/transfers/lib/constants";

// This endpoint must read its secret at request time. Inlining it during a
// build can leave a newly deployed function comparing against a stale value.
export const dynamic = "force-dynamic";

const PROGRAMS_TAG = "program-data";
const REVALIDATION_SCOPES = ["programs", "courses", "transfers", "all"] as const;
type RevalidationScope = (typeof REVALIDATION_SCOPES)[number];

function isRevalidationScope(value: string): value is RevalidationScope {
  return REVALIDATION_SCOPES.includes(value as RevalidationScope);
}

function revalidateCourses(paths: string[]) {
  revalidateTag(CATALOG_TAG, "max");
  revalidatePath("/courses");
  revalidatePath("/courses/[id]", "page");
  paths.push("/courses", "/courses/[id]");
}

export async function POST(request: Request) {
  const secret = process.env["REVALIDATE_SECRET"];

  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: REVALIDATE_SECRET is missing" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token =
    authHeader?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-revalidate-secret");

  if (!token || token !== secret) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing bearer token" },
      { status: 401 }
    );
  }

  const scopeParam = new URL(request.url).searchParams.get("scope");
  const scope = scopeParam ?? "programs";
  if (!isRevalidationScope(scope)) {
    return NextResponse.json({ error: "Invalid revalidation scope." }, { status: 400 });
  }

  try {
    const tags: string[] = [];
    const paths: string[] = [];

    if (scope === "programs" || scope === "all") {
      revalidateTag(PROGRAMS_TAG, "max");
      tags.push(PROGRAMS_TAG);
    }
    if (scope === "courses" || scope === "all") {
      revalidateCourses(paths);
      tags.push(CATALOG_TAG);
    }
    if (scope === "transfers" || scope === "all") {
      revalidateTag(TRANSFER_CACHE_TAG, "max");
      tags.push(TRANSFER_CACHE_TAG);
    }

    return NextResponse.json({
      revalidated: true,
      scope,
      tags,
      paths,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[revalidate] Revalidation failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Revalidation failed." },
      { status: 500 }
    );
  }
}
