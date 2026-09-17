import { createFileRoute } from "@tanstack/react-router";
import { PaginationQuerySchema } from "@repo/contracts";
import { NotificationsFeed } from "@/features/notifications/components/notifications-feed";

export const Route = createFileRoute("/_app/notifications")({
  validateSearch: PaginationQuerySchema,
  component: NotificationsPage,
});

function NotificationsPage() {
  const { page, limit } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <NotificationsFeed
      page={page}
      limit={limit}
      onPageChange={(next) => navigate({ search: { page: next, limit } })}
    />
  );
}
