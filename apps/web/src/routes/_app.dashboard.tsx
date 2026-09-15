import { createFileRoute } from "@tanstack/react-router";
import { notesListQuery } from "@/features/notes/notes.queries";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { NotesCountWidget } from "@/features/dashboard/components/notes-count-widget";
import { RecentNotesWidget } from "@/features/dashboard/components/recent-notes-widget";
import { getWebEnv } from "@/lib/env";

export const Route = createFileRoute("/_app/dashboard")({
  loader: ({ context }) =>
    getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED
      ? context.queryClient.ensureQueryData(notesListQuery(1, 5))
      : undefined,
  pendingComponent: () => (
    <div className="w-full space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  ),
  component: DashboardPage,
});

function DashboardPage() {
  const examplesEnabled = getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED;
  return (
    <div className="w-full space-y-6">
      <DashboardHeader />
      {examplesEnabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NotesCountWidget />
          </div>
          <RecentNotesWidget />
        </>
      )}
    </div>
  );
}
