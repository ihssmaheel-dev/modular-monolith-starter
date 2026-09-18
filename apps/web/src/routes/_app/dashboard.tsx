import { createFileRoute } from "@tanstack/react-router";
import { notesListQuery } from "@/features/notes/notes.queries";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { NotesCountWidget } from "@/features/dashboard/components/notes-count-widget";
import { RecentNotesWidget } from "@/features/dashboard/components/recent-notes-widget";
import {
  WorkspaceStatusWidget,
  UserStatusWidget,
} from "@/features/dashboard/components/workspace-summary-widgets";
import { getWebEnv } from "@/lib/env";

export const Route = createFileRoute("/_app/dashboard")({
  loader: ({ context }) =>
    getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED
      ? context.queryClient.ensureQueryData(notesListQuery(1, 5))
      : undefined,
  pendingComponent: () => (
    <div className="w-full space-y-3.5">
      <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  ),
  component: DashboardPage,
});

function DashboardPage() {
  const examplesEnabled = getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED;
  return (
    <div className="w-full space-y-3.5">
      <DashboardHeader />
      {examplesEnabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NotesCountWidget />
            <WorkspaceStatusWidget />
            <UserStatusWidget />
          </div>
          <RecentNotesWidget />
        </>
      )}
    </div>
  );
}
