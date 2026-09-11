import { createFileRoute } from "@tanstack/react-router";
import { VerifyEmailForm } from "@/features/auth/components/verify-email-form";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-4">
      <VerifyEmailForm token={token} />
    </div>
  );
}
