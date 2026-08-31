import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export default function TransfersLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader currentPage="transfers" />

      <main
        id="main-content"
        className="mx-auto w-full max-w-[var(--spacing-container-max)] flex-1 animate-pulse px-4 py-6 md:px-8 md:py-8 pb-52 md:pb-32"
      >
        <div className="overflow-hidden rounded-lg border border-surface-variant bg-surface-container-lowest shadow-xs">
          <div className="space-y-4 p-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between border-b border-surface-variant pb-4">
                <div className="h-6 w-32 rounded bg-surface-container-high" />
                <div className="h-6 w-16 rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
