/**
 * Browser routes that are referenced outside the web application (for example,
 * links embedded in transactional email). Keep these values framework-neutral
 * so every transport generates links to the same public routes.
 */
export const FRONTEND_ROUTES = {
  home: "/",
  auth: "/auth",
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  verifyEmail: "/verify-email",
  confirmEmailChange: "/confirm-email-change",
  dashboard: "/dashboard",
  notes: "/notes",
  newNote: "/notes/new",
  notifications: "/notifications",
  settings: "/settings",
  users: "/users",
  acceptInvitation: "/accept-invitation",
} as const;

export type FrontendRoute = (typeof FRONTEND_ROUTES)[keyof typeof FRONTEND_ROUTES];

/** Detail path for a note (used by web routes and mobile screens alike). */
export function noteDetailPath(id: string): string {
  return `${FRONTEND_ROUTES.notes}/${encodeURIComponent(id)}`;
}

/** Build an absolute browser URL without interpolating untrusted query values. */
export function buildFrontendUrl(
  baseUrl: string,
  route: FrontendRoute,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(route, `${baseUrl.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
