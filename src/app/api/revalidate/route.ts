import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { TRANSFER_CACHE_TAG } from "@/features/transfers/lib/constants";
import { submitIndexNow } from "@/lib/indexNow";

// This endpoint must read its secret at request time. Inlining it during a
// build can leave a newly deployed function comparing against a stale value.
export const dynamic = "force-dynamic";

const PROGRAMS_TAG = "program-data";
const CATALOG_TAG = "catalog-data";
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

function revalidateTransfers(paths: string[]) {
  revalidateTag(TRANSFER_CACHE_TAG, "max");
  // Flush the route-level Full Route Cache for all cached transfer pages.
  // revalidateTag alone clears unstable_cache entries but not the ISR page
  // cache — revalidatePath is required to purge the CDN-cached rendered page.
  revalidatePath("/transfers");
  revalidatePath("/transfers/subjects");
  revalidatePath("/transfers/subjects/[subject]", "page");
  revalidatePath("/transfers/organizations");
  revalidatePath("/transfers/organizations/[organization]", "page");
  revalidatePath("/transfers/levels");
  revalidatePath("/transfers/levels/[level]", "page");
  revalidatePath("/transfers/courses");
  revalidatePath("/transfers/courses/[courseNumber]", "page");
  paths.push(
    "/transfers",
    "/transfers/subjects",
    "/transfers/subjects/[subject]",
    "/transfers/organizations",
    "/transfers/organizations/[organization]",
    "/transfers/levels",
    "/transfers/levels/[level]",
    "/transfers/courses",
    "/transfers/courses/[courseNumber]",
  );
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
      revalidateTransfers(paths);
      tags.push(TRANSFER_CACHE_TAG);
    }

    let indexNow:
      | Awaited<ReturnType<typeof submitIndexNow>>
      | { submitted: false; scope: RevalidationScope; urlCount: 0; error: "submission_failed" };

    try {
      indexNow = await submitIndexNow(scope);
    } catch (error: unknown) {
      console.error("[indexnow] Submission failed after successful revalidation", {
        scope,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      indexNow = {
        submitted: false,
        scope,
        urlCount: 0,
        error: "submission_failed",
      };
    }

    return NextResponse.json({
      revalidated: true,
      scope,
      tags,
      paths,
      indexNow,
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
