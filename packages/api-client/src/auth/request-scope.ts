import type { ApiClientOptions } from "../types";

/** A request must never be replayed or published into a different account or tenant. */
export function captureRequestScope(options: ApiClientOptions): () => boolean {
  const identity = options.getAuthIdentity?.();
  const tenantId = options.getTenantId?.();
  return () => options.getAuthIdentity?.() === identity && options.getTenantId?.() === tenantId;
}

export async function discardSupersededResponse(response: Response): Promise<Response> {
  // Release the connection without retaining an obsolete account's response payload.
  await response.body?.cancel();
  return new Response(null, { status: 401 });
}
