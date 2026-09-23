import { createFileRoute, redirect } from "@tanstack/react-router";
import { FRONTEND_ROUTES } from "@repo/contracts";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { inviteToken?: string } => ({
    inviteToken: typeof search.inviteToken === "string" ? search.inviteToken : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: FRONTEND_ROUTES.login,
      search: search.inviteToken ? { inviteToken: search.inviteToken } : undefined,
      replace: true,
    });
  },
});
