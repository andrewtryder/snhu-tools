import React from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/Card";
import { getCatalogLastUpdated } from "@/lib/serverData";

export const metadata = {
  title: "About SNHU Degree Map | Unofficial Prerequisite Visualization Tool",
  description: "Learn about SNHU Degree Map, an unofficial degree requirement and course prerequisite mapping tool designed for Southern New Hampshire University students.",
};

export default async function AboutPage() {
  const lastUpdated = await getCatalogLastUpdated();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="about" />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-[var(--spacing-container-max)] space-y-8 px-4 py-8 md:px-8">
          <div className="max-w-3xl space-y-3">
            <h1 className="font-[family-name:var(--font-headline)] text-2xl font-extrabold text-primary sm:text-3xl">
              About SNHU Degree Map
            </h1>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              SNHU Degree Map is an unofficial planning and visualization tool that helps students explore how degree requirements and known prerequisite relationships fit together.
            </p>
          </div>

          <div className="max-w-3xl space-y-6 text-sm leading-relaxed text-on-surface-variant">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-on-surface">Why This Site Exists</h2>
              <p>
                As an SNHU graduate, I know that understanding how required courses, electives, concentrations, and prerequisites fit together can be difficult. This site makes published catalog information easier to explore visually while keeping the source material in view.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-on-surface">How It Works</h2>
              <p>
                Program and course information is synchronized from SNHU&apos;s published catalog. Requirement groups are shown as a readable list, and known prerequisite and corequisite relationships are rendered in an interactive graph. Some relationships may not appear when source rules are prose-based, incomplete, or cannot be expressed as course-to-course edges.
              </p>
            </section>

            <Card className="border-amber-300 bg-amber-50/50 space-y-2">
              <h2 className="text-lg font-bold text-amber-900">Important Disclaimer</h2>
              <p className="text-amber-800">
                This site is unofficial and is not affiliated with or endorsed by SNHU. It is not an official degree audit, and the graph is not an official semester-by-semester course sequence. Verify requirements with the official catalog and an academic advisor.
              </p>
            </Card>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-on-surface">Related SNHU Tools</h2>
              <p>
                SNHU Tools brings together unofficial planning tools that complement each other:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <Link className="font-semibold text-primary hover:underline" href="/courses">
                    Course Prerequisites
                  </Link>{" "}
                  explores individual course dependency chains.
                </li>
                <li>
                  <Link className="font-semibold text-primary hover:underline" href="/transfers">
                    Transfer Equivalencies
                  </Link>{" "}
                  explores accepted transfer mappings.
                </li>
                <li>
                  <span className="font-semibold text-on-surface">Degree Map</span> puts courses into
                  program-level context with requirements and prerequisite graphs.
                </li>
              </ul>
              <p>
                This project is open source and the code may be found at{" "}
                <a
                  className="font-semibold text-primary hover:underline"
                  href="https://github.com/andrewtryder/snhu-tools"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/andrewtryder/snhu-tools
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <AppFooter lastUpdated={lastUpdated} />
    </div>
  );
}
import Link from "next/link";
