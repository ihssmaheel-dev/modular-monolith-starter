import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NotificationsFeed } from "@/features/notifications/components/notifications-feed";

const NotificationsSearchSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const Route = createFileRoute("/_app/notifications")({
  validateSearch: NotificationsSearchSchema,
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
