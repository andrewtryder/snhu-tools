import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Transfer Equivalencies | SNHU Tools",
  description: "Transfer equivalency tools are being integrated into SNHU Tools.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TransfersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-background">
      <AppHeader currentPage="transfers" />
      <main className="mx-auto w-full max-w-[var(--spacing-container-max)] flex-1 px-4 py-12 md:px-8">
        <div className="mx-auto max-w-2xl">
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="neutral">Under Integration</Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 text-on-surface">
                <ArrowLeftRightIcon className="h-6 w-6 text-primary" aria-hidden="true" />
                Transfer Equivalencies
              </h1>
              <p className="mt-1 text-base text-on-surface-variant">
                Transfer equivalency tools and course mappings are being integrated into SNHU Tools.
              </p>
            </div>
            <div className="space-y-4 text-sm text-on-surface-variant">
              <p>
                During this consolidation phase, explore active degree program requirements with integrated transfer coverage indicators.
              </p>
              <div>
                <Link
                  href="/programs"
                  className="inline-flex items-center justify-center font-medium rounded-lg px-4 py-2 text-sm bg-primary text-on-primary hover:bg-primary-container shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Explore Degree Programs
                  <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
