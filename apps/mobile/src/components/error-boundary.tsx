import * as React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { ErrorBoundaryProps } from "expo-router";
import { formatErrorRef, type ApiErrorEnvelope } from "@repo/contracts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const errorRef = React.useMemo(() => {
    const envelope = extractEnvelope(error);
    if (envelope) {
      return envelope.errorRef ?? formatErrorRef(envelope.traceId, envelope.requestId);
    }
    return `c-${getClientHash(error)}`;
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <View className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-destructive font-bold text-lg">
              {t("errors.unexpected")}
            </CardTitle>
            <Badge variant="outline">
              <Text className="font-mono text-xs text-muted-foreground">ref #{errorRef}</Text>
            </Badge>
          </View>
          <CardDescription>{t("errors.serverError")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <Text className="text-xs text-muted-foreground">
            {t("errors.ref", { ref: errorRef })}
          </Text>
          <Button variant="outline" size="sm" onPress={retry}>
            <Text className="text-sm font-medium">{t("common.retry")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}

function extractEnvelope(error: unknown): ApiErrorEnvelope | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && "requestId" in error && "status" in error) {
    return error as ApiErrorEnvelope;
  }
  if ("error" in error && typeof (error as { error?: unknown }).error === "object") {
    return extractEnvelope((error as { error?: unknown }).error);
  }
  if ("cause" in error && typeof (error as { cause?: unknown }).cause === "object") {
    return extractEnvelope((error as { cause?: unknown }).cause);
  }
  return undefined;
}

function getClientHash(error: unknown): string {
  const str = error instanceof Error ? (error.stack ?? error.message) : String(error);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
}
