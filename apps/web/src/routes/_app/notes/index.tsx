import { createFileRoute, redirect } from "@tanstack/react-router";
import { PaginationQuerySchema } from "@repo/contracts";
import { RouteErrorFallback } from "@/components/error-boundary";
import { notesListQuery } from "@/features/notes/notes.queries";
import { NotesList } from "@/features/notes/components/notes-list";
import { getWebEnv } from "@/lib/env";

export const Route = createFileRoute("/_app/notes/")({
  beforeLoad: () => {
    if (!getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED) throw redirect({ to: "/dashboard" });
  },
  validateSearch: PaginationQuerySchema,
  loaderDeps: ({ search }) => ({ page: search.page, limit: search.limit }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(notesListQuery(deps.page, deps.limit)),
  errorComponent: RouteErrorFallback,
  component: NotesPage,
});

function NotesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <NotesList
      page={search.page ?? 1}
      limit={search.limit ?? 20}
      onPageChange={(next) => navigate({ search: (previous) => ({ ...previous, page: next }) })}
    />
  );
}
