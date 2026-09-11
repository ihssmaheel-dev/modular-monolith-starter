import { createFileRoute } from "@tanstack/react-router";
import { EmailChangeForm } from "@/features/users/components/email-change-form";

export const Route = createFileRoute("/confirm-email-change")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ConfirmEmailChangePage,
});

function ConfirmEmailChangePage() {
  const { token } = Route.useSearch();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-4">
      <EmailChangeForm token={token} />
    </div>
  );
}
