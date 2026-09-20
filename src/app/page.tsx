import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCatalogLastUpdated, getPrograms } from "@/lib/serverData";
import { resolvePopularBachelorPrograms } from "@/lib/popularBachelorPrograms";
import { siteConfig } from "@/lib/site";
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  GitBranchIcon,
  LayersIcon,
} from "lucide-react";

export const revalidate = false;

const homeTitle = "SNHU Degree Maps, Course Prerequisites & Transfer Equivalencies";

export const metadata: Metadata = {
  title: homeTitle,
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: homeTitle,
    description: siteConfig.description,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: siteConfig.description,
  },
};

const PREVIEW_IMAGE = {
  src: "/home/computer-science-degree-map-preview.webp",
  width: 1024,
  height: 576,
  alt: "Computer Science degree map showing branching prerequisite relationships between programming, mathematics, systems, and capstone courses.",
} as const;

const PREVIEW_BENEFITS = [
  {
    icon: GitBranchIcon,
    text: "Follow known prerequisite and corequisite relationships.",
  },
  {
    icon: LayersIcon,
    text: "Understand general education, major, core, and elective requirements.",
  },
  {
    icon: ArrowLeftRightIcon,
    text: "Open course details and current transfer-equivalency listings.",
  },
] as const;

export default async function HomePage() {
  const [programs, lastUpdated] = await Promise.all([getPrograms(), getCatalogLastUpdated()]);
  const popularBachelorPrograms = resolvePopularBachelorPrograms(programs);
  const computerScienceProgram = popularBachelorPrograms.find(
    (program) => program.slug === "computer-science-bs",
  );
  const computerScienceHref = computerScienceProgram
    ? `/programs/${computerScienceProgram.slug}`
    : "/programs/computer-science-bs";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="home" initialPrograms={programs} />

      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-[var(--spacing-container-max)] px-4 py-8 md:px-8 space-y-8">
          <Card className="relative overflow-hidden border-primary/20 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-lowest p-6 sm:p-8 shadow-md">
            <div className="max-w-3xl space-y-4">
              <h1 className="font-[family-name:var(--font-headline)] text-3xl sm:text-4xl font-extrabold tracking-tight text-primary">
                SNHU Degree Map
              </h1>

              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed">
                Explore interactive prerequisite graphs, degree requirement structures, and course sequencing for Southern New Hampshire University programs.
              </p>
            </div>
          </Card>

          <section aria-labelledby="degree-map-preview-heading" className="space-y-4">
            <Card className="overflow-hidden p-5 sm:p-6">
              <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-outline">
                      What Degree Map Shows
                    </p>
                    <h2
                      id="degree-map-preview-heading"
                      className="font-[family-name:var(--font-headline)] text-xl font-bold text-primary sm:text-2xl"
                    >
                      See how a degree fits together
                    </h2>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      SNHU Degree Map turns published catalog requirements into an interactive
                      visual map. Explore which courses belong to a program, how known prerequisites
                      connect, and where transfer listings may be available.
                    </p>
                  </div>

                  <ul className="space-y-2.5">
                    {PREVIEW_BENEFITS.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-2.5 text-sm text-on-surface">
                        <Icon
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2">
                    <Link
                      href={computerScienceHref}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Explore the Computer Science BS map
                      <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <p className="text-xs text-on-surface-variant">
                      Maps show known catalog relationships and are not official semester-by-semester
                      course plans.
                    </p>
                  </div>
                </div>

                <figure className="min-w-0 space-y-2">
                  <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-sm">
                    <Image
                      src={PREVIEW_IMAGE.src}
                      alt={PREVIEW_IMAGE.alt}
                      width={PREVIEW_IMAGE.width}
                      height={PREVIEW_IMAGE.height}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 55vw, 700px"
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="text-xs text-on-surface-variant">
                    <Link
                      href={computerScienceHref}
                      className="font-medium text-on-surface-variant hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Example: Computer Science BS prerequisite relationships
                    </Link>
                  </figcaption>
                </figure>
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-surface">
                  Popular Bachelor’s Programs
                </h2>
                <p className="text-xs text-on-surface-variant">
                  A curated selection of bachelor’s degree maps. Browse the full directory for every
                  available program.
                </p>
              </div>
              <Link
                href="/programs"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                View all programs <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {popularBachelorPrograms.map((program) => (
                <Card
                  key={program.slug}
                  hoverable
                  className="flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <Badge variant="outline">{program.degreeLevel}</Badge>

                    <h3 className="text-lg font-bold text-on-surface hover:text-primary transition-colors">
                      <Link href={`/programs/${program.slug}`}>{program.title}</Link>
                    </h3>

                    <p className="text-xs text-on-surface-variant line-clamp-2">
                      {program.description}
                    </p>
                  </div>

                  <div className="border-t border-surface-variant pt-3 flex items-center justify-between text-xs text-on-surface-variant">
                    <span>
                      {program.totalCredits == null
                        ? "Credits not specified"
                        : `${program.totalCredits} Total Credits`}
                    </span>
                    <Link
                      href={`/programs/${program.slug}`}
                      className="font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      View Map <ArrowRightIcon className="h-3 w-3" />
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>

      <AppFooter lastUpdated={lastUpdated} />
    </div>
  );
}
