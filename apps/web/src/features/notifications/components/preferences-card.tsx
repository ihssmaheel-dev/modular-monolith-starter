import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import type { DigestCadence, PreferenceItem } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { preferencesQuery } from "../notifications.queries";
import { useUpdatePreferencesMutation } from "../notifications.mutations";

const CHANNELS = ["inApp", "email", "push"] as const;
const CADENCES: DigestCadence[] = ["realtime", "hourly", "daily"];

const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  inApp: "notifications.channelInApp",
  email: "notifications.channelEmail",
  push: "notifications.channelPush",
};

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
  const updateMutation = useUpdatePreferencesMutation();
  const [draft, setDraft] = useState<PreferenceItem[] | null>(null);
  const rows = draft ?? prefsQuery.data ?? [];

  useEffect(() => {
    setDraft(null);
  }, [prefsQuery.dataUpdatedAt]);

  const toggle = (category: string, channel: (typeof CHANNELS)[number], value: boolean) => {
    setDraft(
      (rows.length > 0 ? rows : (prefsQuery.data ?? [])).map((row) =>
        row.category === category ? { ...row, [channel]: value } : row,
      ),
    );
  };

  const setCadence = (category: string, digestCadence: DigestCadence) => {
    setDraft(
      (rows.length > 0 ? rows : (prefsQuery.data ?? [])).map((row) =>
        row.category === category ? { ...row, digestCadence } : row,
      ),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {t("notifications.preferencesTitle")}
        </CardTitle>
        <CardDescription>{t("notifications.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.category} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{t(CATEGORY_LABELS[row.category] ?? row.category)}</p>
            <div className="flex flex-wrap gap-4">
              {CHANNELS.map((channel) => (
                <div key={channel} className="flex items-center gap-2">
                  <Switch
                    checked={row[channel]}
                    onCheckedChange={(value) => toggle(row.category, channel, value)}
                    aria-label={t(CHANNEL_LABELS[channel])}
                  />
                  <Label>{t(CHANNEL_LABELS[channel])}</Label>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={row.digestCadence}
                onValueChange={(value) => setCadence(row.category, value as DigestCadence)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((cadence) => (
                    <SelectItem key={cadence} value={cadence}>
                      {t(CADENCE_LABELS[cadence])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button
            disabled={!draft || updateMutation.isPending}
            onClick={() => draft && updateMutation.mutate(draft)}
          >
            {t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
