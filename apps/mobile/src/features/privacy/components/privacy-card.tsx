import { useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useRequestExportMutation,
  useEraseAccountMutation,
} from "@/features/privacy/privacy.mutations";

interface PrivacyCardProps {
  onAccountErased: () => void;
}

export function PrivacyCard({ onAccountErased }: PrivacyCardProps) {
  const { t } = useTranslation();
  const [erasePassword, setErasePassword] = useState("");
  const exportMutation = useRequestExportMutation();
  const eraseMutation = useEraseAccountMutation({
    onSuccess: onAccountErased,
  });

  return (
    <Card>
      <Text className="text-base font-bold text-foreground">{t("privacy.title")}</Text>
      <Text className="mt-1 text-xs text-muted-foreground">{t("privacy.description")}</Text>
      <View className="mt-3 gap-2">
        <Button
          variant="outline"
          loading={exportMutation.isPending}
          onPress={() => exportMutation.mutate()}
        >
          {t("privacy.requestExport")}
        </Button>
        <Input
          secureTextEntry
          autoComplete="password"
          placeholder={t("privacy.confirmPassword")}
          value={erasePassword}
          onChangeText={setErasePassword}
        />
        <Button
          variant="destructive"
          loading={eraseMutation.isPending}
          disabled={!erasePassword}
          onPress={() => eraseMutation.mutate(erasePassword)}
        >
          {t("privacy.eraseAccount")}
        </Button>
      </View>
    </Card>
  );
}
