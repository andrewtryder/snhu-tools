import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import {
  TransfersClientPage,
  type TransferCoursesData,
} from "@/features/transfers/components/TransfersClientPage";
import { buildFacetSummaries, getAllTransferRows } from "@/features/transfers/lib/seoQueries";
import { serializeJsonLd } from "@/lib/safeJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "SNHU Transfer Equivalency List | Search Accepted Transfer Credits",
  description:
    "Search unofficial SNHU transfer equivalencies and accepted transfer credits by course number, provider, subject, and level. Compare sources like Sophia Learning, Study.com, AP Exams, and more.",
  alternates: {
    canonical: `${siteUrl}/transfers`,
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "SNHU Transfer Equivalency List | Search Accepted Transfer Credits",
    description:
      "Search unofficial SNHU transfer equivalencies and accepted transfer credits by course number, provider, subject, and level. Compare sources like Sophia Learning, Study.com, AP Exams, and more.",
    url: `${siteUrl}/transfers`,
  },
  twitter: {
    card: "summary",
    title: "SNHU Transfer Equivalency List | Search Accepted Transfer Credits",
    description:
      "Search unofficial SNHU transfer equivalencies and accepted transfer credits by course number, provider, subject, and level. Compare sources like Sophia Learning, Study.com, AP Exams, and more.",
  },
};

function toCoursesData(rows: Awaited<ReturnType<typeof getAllTransferRows>>): TransferCoursesData {
  const data: TransferCoursesData = {};

  for (const row of rows) {
    const subjectPrefix = row.subjectPrefix || "UNKNOWN";
    const courseNumber = row.courseNumber || "UNKNOWN";

    if (!data[subjectPrefix]) {
      data[subjectPrefix] = {};
    }
    if (!data[subjectPrefix][courseNumber]) {
      data[subjectPrefix][courseNumber] = [];
    }

    data[subjectPrefix][courseNumber].push({
      title: row.title,
      pid: row.pid,
      eligibilityTimeframe: row.eligibilityTimeframe,
      groupFilter2Name: row.groupFilter2Name,
      academicLevel: row.academicLevel,
      coursePID: row.coursePID,
      courseName: row.courseNumber,
    });
  }

  return data;
}

export async function getHomepagePayload() {
  try {
    const rows = await getAllTransferRows();
    const facets = buildFacetSummaries(rows, 20);
    return { rows, facets, dataUnavailable: false };
  } catch (error) {
    console.error("Failed to fetch homepage transfer data:", error);
    return {
      rows: [],
      facets: buildFacetSummaries([], 20),
      dataUnavailable: true,
    };
  }
}

export default async function TransfersPage() {
  await connection();
  const { rows, facets, dataUnavailable } = await getHomepagePayload();

  const webSiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SNHU Transfers",
    description:
      "Unofficial SNHU transfer equivalency search tool for accepted transfer credits by course, provider, subject, and academic level.",
    url: `${siteUrl}/transfers`,
    publisher: {
      "@type": "Organization",
      name: "SNHU Transfers",
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[var(--spacing-container-max)] flex-1 flex-col gap-6 px-4 py-6 pb-52 md:px-8 md:py-8 md:pb-32"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(webSiteJsonLd) }}
        />

        {dataUnavailable ? (
          <div
            role="alert"
            className="rounded-lg border border-warning-container bg-warning-container/20 p-4 text-sm text-on-surface"
          >
            Transfer data is temporarily unavailable. Please try again shortly.
          </div>
        ) : null}

        <Suspense fallback={null}>
          <TransfersClientPage initialCoursesData={toCoursesData(rows)} seoFacets={facets} />
        </Suspense>
      </main>

      <AppFooter />
    </div>
  );
}
