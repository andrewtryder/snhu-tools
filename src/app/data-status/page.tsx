import React from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MetricCard } from "@/components/ui/MetricCard";
import { getPrograms, getCatalogYears, getProgramSyncState } from "@/lib/serverData";
import { getPool } from "@/lib/db/pool";
import { getRequestManifest } from "@/lib/snapshots/readThrough";
import { isDbAvailabilityError } from "@/lib/snapshots/availability";
import { kualiConfig } from "@/config/kualiConfig";
import { CheckCircle2Icon, DatabaseIcon, AlertTriangleIcon, ActivityIcon, RefreshCwIcon, XCircleIcon } from "lucide-react";

// Sync state changes only when the scheduled Programs writer runs. Keep this
// page static between promotions and refresh it through the revalidation webhook.
export const revalidate = false;

export const metadata = {
  title: "Data Status & Catalog Sync Health | SNHU Degree Map",
  description: "Live status dashboard displaying catalog synchronization health, program counts, and parser diagnostics for SNHU Degree Map.",
};

/** Soft DB probe — never throws; used only for status messaging. */
async function probeDatabaseAvailable(): Promise<boolean> {
  if (!process.env.POSTGRES_URL) return false;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    if (isDbAvailabilityError(error)) return false;
    console.error("[data-status] DB probe failed", error);
    return false;
  }
}

export default async function DataStatusPage() {
  // Build/runtime must survive DB outages (e.g. provider quota). Other catalog
  // pages already catch; this page previously rethrew and failed `next build`.
  let programs: Awaited<ReturnType<typeof getPrograms>> = [];
  let years: Awaited<ReturnType<typeof getCatalogYears>> = [];
  let syncState: Awaited<ReturnType<typeof getProgramSyncState>> = null;
  let manifest: Awaited<ReturnType<typeof getRequestManifest>> = null;
  let dbAvailable = true;

  try {
    ;[programs, years, syncState, manifest, dbAvailable] = await Promise.all([
      getPrograms(),
      getCatalogYears(),
      getProgramSyncState(),
      getRequestManifest(),
      probeDatabaseAvailable(),
    ]);
  } catch (err) {
    console.error("[data-status] Failed to load status data", err);
  }

  const totalPrograms = programs.length;
  const unparsedNotesCount = programs.reduce((acc, p) => acc + (p.unparsedRequirements?.length || 0), 0);
  const servingSnapshotWhileDbDown = !dbAvailable && !!manifest?.programsVersion;

  const isSyncing = syncState?.status === "syncing";
  const hasError = !!syncState?.last_error;
  const statusColor = servingSnapshotWhileDbDown
    ? "text-amber-800 bg-amber-50 border-amber-200"
    : isSyncing
      ? "text-blue-700 bg-blue-50 border-blue-200"
      : hasError
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-emerald-700 bg-emerald-50 border-emerald-200";
  const StatusIcon = servingSnapshotWhileDbDown
    ? AlertTriangleIcon
    : isSyncing
      ? RefreshCwIcon
      : hasError
        ? XCircleIcon
        : CheckCircle2Icon;
  const statusPulse = servingSnapshotWhileDbDown
    ? "bg-amber-500"
    : isSyncing
      ? "bg-blue-500 animate-spin"
      : hasError
        ? "bg-red-500"
        : "bg-emerald-500 animate-pulse";
  const statusText = servingSnapshotWhileDbDown
    ? "Serving last-known-good snapshot"
    : isSyncing
      ? "Syncing..."
      : hasError
        ? "Sync Failed"
        : "All Systems Operational";

  const snapshotPublishedAt = manifest?.publishedAt
    ? new Date(manifest.publishedAt).toLocaleString()
    : "Never";
  const sourceUpdatedAt = manifest?.sourceUpdatedAt?.programs
    ? new Date(manifest.sourceUpdatedAt.programs).toLocaleString()
    : "Unknown";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="about" />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-[var(--spacing-container-max)] px-4 py-8 md:px-8 space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Live System Status</Badge>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor}`}>
                  <StatusIcon className={`h-3.5 w-3.5 ${statusPulse.includes("spin") || statusPulse.includes("pulse") ? statusPulse.split(" ")[1] : ""}`} /> {statusText}
                </span>
              </div>
              <h1 className="font-[family-name:var(--font-headline)] text-2xl sm:text-3xl font-extrabold text-primary">
                Catalog Synchronization Status
              </h1>
            </div>

            <Link
              href="/methodology"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Read Data Methodology →
            </Link>
          </div>

          {servingSnapshotWhileDbDown ? (
            <Card className="border-amber-200 bg-amber-50/60 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Database temporarily unavailable — serving durable snapshot
              </p>
              <p className="text-xs text-amber-800">
                Public catalog pages continue from the last successful publish.
                Snapshot published {snapshotPublishedAt}; catalog source updated {sourceUpdatedAt}.
              </p>
            </Card>
          ) : null}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Active Catalog ID"
              value={kualiConfig.catalogId.substring(0, 10) + "..."}
              subtext={`SNHU Catalog ${years.join(", ")}`}
              icon={<DatabaseIcon className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              label="Synchronized Programs"
              value={totalPrograms}
              subtext="Normalized degree programs"
              icon={<CheckCircle2Icon className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              label="Parser Warnings"
              value={unparsedNotesCount}
              subtext="Catalog notes flagged for audit"
              icon={<AlertTriangleIcon className="h-5 w-5 text-amber-600" />}
            />
            <MetricCard
              label="Last Sync Run"
              value={syncState?.completed_at ? new Date(syncState.completed_at).toLocaleDateString() : "Never"}
              subtext={syncState?.next_due_at ? `Next sync: ${new Date(syncState.next_due_at).toLocaleDateString()}` : "Scheduled via CircleCI"}
              icon={<ActivityIcon className="h-5 w-5 text-primary" />}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard
              label="Snapshot Published"
              value={snapshotPublishedAt}
              subtext={manifest ? `Programs v${manifest.programsVersion ?? "—"}` : "No durable snapshot yet"}
              icon={<DatabaseIcon className="h-5 w-5 text-primary" />}
            />
            <MetricCard
              label="Source Updated At"
              value={sourceUpdatedAt}
              subtext="Programs catalog source timestamp"
              icon={<ActivityIcon className="h-5 w-5 text-primary" />}
            />
          </div>

          {/* Program Ingestion Table */}
          <Card className="space-y-4">
            <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
              <DatabaseIcon className="h-4 w-4 text-primary" /> Synchronized Catalog Programs
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant bg-surface-container-low text-on-surface-variant">
                    <th className="p-3 font-semibold">Program Title</th>
                    <th className="p-3 font-semibold">Credential</th>
                    <th className="p-3 font-semibold">Degree Level</th>
                    <th className="p-3 font-semibold">Known Courses</th>
                    <th className="p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant">
                  {programs.map((p) => (
                    <tr key={p.slug} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-3 font-bold text-primary">
                        <Link href={`/programs/${p.slug}`} className="hover:underline">
                          {p.title}
                        </Link>
                      </td>
                      <td className="p-3 text-on-surface">{p.credential}</td>
                      <td className="p-3">
                        <Badge variant="outline" size="sm">
                          {p.degreeLevel}
                        </Badge>
                      </td>
                      <td className="p-3 text-on-surface font-mono">{p.requiredCourseCount}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2Icon className="h-3 w-3" /> Synchronized
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
