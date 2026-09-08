import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { DigestCadence } from "@repo/contracts";
import { UpdatePreferencesSchema } from "@repo/contracts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { preferencesQuery } from "../notifications.queries";
import { useUpdatePreferencesMutation } from "../notifications.mutations";

const CHANNEL_LABELS = {
  inApp: "notifications.channelInApp",
  email: "notifications.channelEmail",
  push: "notifications.channelPush",
} as const;

const CADENCE_LABELS: Record<DigestCadence, string> = {
  realtime: "notifications.cadenceRealtime",
  hourly: "notifications.cadenceHourly",
  daily: "notifications.cadenceDaily",
};

const CATEGORY_LABELS: Record<string, string> = {
  account: "notifications.categoryAccount",
  collaboration: "notifications.categoryCollaboration",
  workspace: "notifications.categoryWorkspace",
  privacy: "notifications.categoryPrivacy",
};

export function PreferencesCard() {
  const { t } = useTranslation();
  const prefsQuery = useQuery(preferencesQuery());
  const prefsMutation = useUpdatePreferencesMutation();

  const saveRow = (
    category: string,
    apply: (row: NonNullable<typeof prefsQuery.data>[number]) => object,
  ) => {
    const current = prefsQuery.data ?? [];
    const next = current.map((row) =>
      row.category === category ? { ...row, ...apply(row) } : row,
    );
    const parsed = UpdatePreferencesSchema.safeParse({ preferences: next });
    if (parsed.success) prefsMutation.mutate(parsed.data.preferences);
  };

  return (
    <Card>
      <Text className="text-base font-bold text-foreground">
        {t("notifications.preferencesTitle")}
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {t("notifications.preferencesDescription")}
      </Text>
      {prefsQuery.isLoading ? (
        <Text className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</Text>
      ) : prefsQuery.isError ? (
        <View className="mt-3 gap-2">
          <Text className="text-sm text-destructive">{t("api.notifications.fetchFailed")}</Text>
          <Button variant="outline" onPress={() => prefsQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </View>
      ) : (
        <View className="mt-3 gap-3">
          {(prefsQuery.data ?? []).map((row) => (
            <View key={row.category}>
              <Text className="text-sm font-medium text-foreground">
                {t(CATEGORY_LABELS[row.category] ?? "common.unknown")}
              </Text>
              <View className="mt-1 flex-row gap-2">
                {(["inApp", "email", "push"] as const).map((channel) => (
                  <Pressable
                    key={channel}
                    disabled={prefsMutation.isPending}
                    onPress={() => saveRow(row.category, (r) => ({ [channel]: !r[channel] }))}
                    className={`rounded-lg border px-3 py-1.5 ${row[channel] ? "bg-primary border-primary" : "border-border"} ${prefsMutation.isPending ? "opacity-50" : ""}`}
                  >
                    <Text
                      className={`text-xs font-medium ${row[channel] ? "text-primary-foreground" : "text-foreground"}`}
                    >
                      {t(CHANNEL_LABELS[channel])}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View className="mt-1 flex-row gap-2">
                {(["realtime", "hourly", "daily"] as const).map((cadence) => (
                  <Pressable
                    key={cadence}
                    disabled={prefsMutation.isPending}
                    onPress={() => saveRow(row.category, () => ({ digestCadence: cadence }))}
                    className={`rounded-lg border px-3 py-1.5 ${row.digestCadence === cadence ? "bg-primary border-primary" : "border-border"} ${prefsMutation.isPending ? "opacity-50" : ""}`}
                  >
                    <Text
                      className={`text-xs font-medium ${row.digestCadence === cadence ? "text-primary-foreground" : "text-foreground"}`}
                    >
                      {t(CADENCE_LABELS[cadence])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {prefsMutation.isError && (
            <Text className="text-sm text-destructive">
              {t("api.notifications.preferenceInvalid")}
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}
