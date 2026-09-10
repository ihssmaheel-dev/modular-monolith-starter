/**
 * Shared guards for cross-tab adapters. Every adapter in this directory
 * funnels through these so scope naming and message validation stay uniform.
 */

export function isSyncMessage(value: unknown): value is { type: string } & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { type?: unknown }).type === "string";
}

export interface IdentityScope {
  userId?: string | null;
  tenantId?: string | null;
}

/**
 * Channel naming convention (see FRONTEND_RULES.md):
 * - global scope (theme, locale) → bare base name, last-write-wins.
 * - identity scope (query cache) → base + user + tenant, so different
 *   users can never share a channel. No identity → caller must not subscribe.
 */
export function scopedChannel(base: string, scope: IdentityScope = {}): string {
  const userId = scope.userId ?? null;
  if (!userId) return base;
  return `${base}:${userId}:${scope.tenantId ?? "-"}`;
}
