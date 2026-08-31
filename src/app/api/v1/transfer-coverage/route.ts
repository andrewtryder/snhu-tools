/**
 * GET /api/v1/transfer-coverage
 *
 * Public, read-only transfer-equivalency coverage for a bounded list of SNHU
 * course codes. Results come from the live `transfer_courses` table and the
 * last successful sync timestamp in `transfer_sync_state`.
 *
 * This route never mutates data, never queries staging, and never triggers sync.
 */
import { MAX_COURSES_QUERY_CHARS } from "@/features/transfers/lib/constants";
import { parseCoursesQuery } from "@/features/transfers/lib/courseCode";
import { getTransferCoverageResponse } from "@/features/transfers/lib/transferCoverage";

/** Shared by browsers/proxies; Vercel may strip s-maxage from the client-visible value. */
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
/** Explicit CDN directive so Vercel edge caching remains bounded after sync. */
const CDN_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    invalidCourseCodes?: string[];
  };
};

function jsonError(status: number, body: ErrorBody, cacheControl = "no-store") {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coursesParam = searchParams.get("courses");

  if (coursesParam != null && coursesParam.length > MAX_COURSES_QUERY_CHARS) {
    return jsonError(400, {
      error: {
        code: "INVALID_COURSE_CODE",
        message: "The courses query parameter is too long.",
      },
    });
  }

  const parsed = parseCoursesQuery(coursesParam);

  if (!parsed.ok) {
    if (parsed.error === "MISSING_COURSES") {
      return jsonError(400, {
        error: {
          code: "MISSING_COURSES",
          message: "The courses query parameter is required.",
        },
      });
    }

    if (parsed.error === "TOO_MANY_COURSES") {
      return jsonError(400, {
        error: {
          code: "TOO_MANY_COURSES",
          message: "A maximum of 100 unique course codes may be requested.",
        },
      });
    }

    return jsonError(400, {
      error: {
        code: "INVALID_COURSE_CODE",
        message: "One or more course codes are invalid.",
        invalidCourseCodes: parsed.invalidCourseCodes,
      },
    });
  }

  try {
    const body = await getTransferCoverageResponse(parsed.courseCodes);

    const headers = new Headers({
      "Cache-Control": CACHE_CONTROL,
      "CDN-Cache-Control": CDN_CACHE_CONTROL,
      "Content-Type": "application/json",
    });

    if (body.dataLastUpdatedAt) {
      headers.set("Last-Modified", new Date(body.dataLastUpdatedAt).toUTCString());
    }

    return Response.json(body, { status: 200, headers });
  } catch (error) {
    console.error("[transfer-coverage] Transfer data unavailable", {
      requestedCourseCount: parsed.courseCodes.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    return jsonError(503, {
      error: {
        code: "TRANSFER_DATA_UNAVAILABLE",
        message: "Transfer-equivalency data is temporarily unavailable.",
      },
    });
  }
}
