import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useTenantStore } from "@/stores/tenant.store";

export function notesListQuery(page = 1, limit = 20) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: queryKeys.notes.list(tenantId, page, limit),
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.notes.list({ page, limit });
      if (res.status !== 200) throw new Error("api.note.fetchFailed");
      return res.body;
    },
  });
}

export function noteByIdQuery(id: string) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: queryKeys.notes.detail(tenantId, id),
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.notes.get(id);
      if (res.status === 404) throw new Error("api.note.notFound");
      if (res.status !== 200) throw new Error("api.note.fetchFailed");
      return res.body;
    },
    enabled: !!id,
  });
}

export function noteAttachmentsQuery(id: string) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: queryKeys.notes.attachments(tenantId, id),
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.notes.listAttachments(id, { limit: 100 });
      if (res.status !== 200) throw new Error("api.note.notFound");
      return res.body;
    },
    enabled: !!id,
  });
}
