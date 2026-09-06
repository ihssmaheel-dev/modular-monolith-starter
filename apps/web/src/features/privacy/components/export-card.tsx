import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { privacyRequestsQuery, downloadExportFile } from "../privacy.queries";
import { useRequestExportMutation } from "../privacy.mutations";

const EXPORT_FILENAME = "my-data-export.json";

export function ExportCard() {
  const { t } = useTranslation();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const requestsQuery = useQuery(privacyRequestsQuery(1, 20));
  const exportMutation = useRequestExportMutation();

  const readyExports = (requestsQuery.data?.requests ?? []).filter(
    (r) => r.type === "EXPORT" && r.status === "READY",
  );

  const download = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadExportFile(id, EXPORT_FILENAME);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="size-4" />
          {t("privacy.exportTitle")}
        </CardTitle>
        <CardDescription>{t("privacy.exportDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="justify-start gap-2"
        >
          <Download className="size-4" />
          {exportMutation.isPending ? t("privacy.requestingExport") : t("privacy.requestExport")}
        </Button>
        {readyExports.length > 0 && (
          <div className="space-y-2">
            {readyExports.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloadingId === item.id}
                  onClick={() => download(item.id)}
                >
                  {t("privacy.downloadExport")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
