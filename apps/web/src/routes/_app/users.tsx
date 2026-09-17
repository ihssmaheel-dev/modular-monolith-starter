import { createFileRoute, redirect } from "@tanstack/react-router";
import { FRONTEND_ROUTES, PaginationQuerySchema } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { RouteErrorFallback } from "@/components/error-boundary";
import { usersListQuery } from "@/features/users/users.queries";
import { UsersList } from "@/features/users/components/users-list";

export const Route = createFileRoute("/_app/users")({
  validateSearch: PaginationQuerySchema,
  beforeLoad: () => {
    if (useAuthStore.getState().user?.role !== "admin") {
      throw redirect({ to: FRONTEND_ROUTES.dashboard, replace: true });
    }
  },
  loaderDeps: ({ search }) => ({ page: search.page, limit: search.limit }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(usersListQuery(deps.page, deps.limit)),
  errorComponent: RouteErrorFallback,
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <UsersList
      page={search.page ?? 1}
      limit={search.limit ?? 20}
      onPageChange={(next) => navigate({ search: (previous) => ({ ...previous, page: next }) })}
    />
  );
}
