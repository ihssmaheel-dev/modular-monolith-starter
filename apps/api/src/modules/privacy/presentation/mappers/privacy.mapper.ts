import type { DsrResponse } from "@repo/contracts";
import type { DsrRequest } from "../../domain/entities/dsr.entity";

function toIso(value: Date): string {
  return value.toISOString();
}

export function toDsrResponse(request: DsrRequest): DsrResponse {
  const data = request.toJSON();
  return {
    id: data.id,
    type: data.type,
    status: data.status,
    tenantId: data.tenantId ?? null,
    expiresAt: data.expiresAt ? toIso(data.expiresAt) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
