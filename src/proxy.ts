import { NextRequest, NextResponse } from "next/server";
import { resolveProgramsRedirect } from "@/lib/programsUrlCanonical";

export function proxy(request: NextRequest) {
  const programsTarget = resolveProgramsRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (programsTarget) {
    const url = request.nextUrl.clone();
    url.pathname = programsTarget;
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/programs"],
};
