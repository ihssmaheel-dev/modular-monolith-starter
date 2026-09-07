import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function privacyRequestsQuery(page = 1, limit = 20) {
  return queryOptions({
    queryKey: queryKeys.privacy.requests(page, limit),
    queryFn: async () => {
      const res = await getApiClient().privacy.listRequests({ page, limit });
      if (res.status !== 200) throw new Error("api.privacy.exportFailed");
      return res.body;
    },
  });
}

export async function downloadExportFile(
  id: string,
  fallbackName: string,
): Promise<import("@repo/contracts").ExportDownloadResponse> {
  const res = await getApiClient().privacy.downloadExport(id);
  if (res.status !== 200) throw new Error("api.privacy.exportFailed");
  const blob = new Blob([JSON.stringify(res.body, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return res.body;
}
