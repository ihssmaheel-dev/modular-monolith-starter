import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Check, Copy } from "lucide-react";
import { extractErrorDetails, formatSupportClipboardText } from "@/lib/error-reference";

export function RouteErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const details = extractErrorDetails(error);

  const handleCopy = async () => {
    const text = formatSupportClipboardText(details);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed in non-interactive environment
    }
  };

  return (
    <div className="w-full">
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-destructive">{t("errors.unexpected")}</CardTitle>
            <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
              ref #{details.errorRef}
            </Badge>
          </div>
          <CardDescription>{t("errors.serverError")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {t("errors.ref", { ref: details.errorRef })}
          </p>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            {t("common.retry")}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1 text-xs">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("errors.copiedDetails") : t("errors.copyDetails")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
