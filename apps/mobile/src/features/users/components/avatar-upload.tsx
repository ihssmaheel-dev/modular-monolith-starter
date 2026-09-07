import * as React from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { AVATAR_MIME_TYPES } from "@repo/contracts";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { useAttachAvatarMutation, useRemoveAvatarMutation } from "../avatar.mutations";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarUpload() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [picking, setPicking] = React.useState(false);
  const attachMutation = useAttachAvatarMutation();
  const removeMutation = useRemoveAvatarMutation();

  const avatarUrlQuery = useQuery({
    queryKey: ["users", "avatar", user?.avatarFileId ?? null],
    queryFn: async () => {
      const res = await getApiClient().files.getDownloadUrl({
        params: { id: user?.avatarFileId as string },
      });
      if (res.status !== 200 || !res.body) throw new Error("api.error.internal");
      return res.body.downloadUrl;
    },
    enabled: !!user?.avatarFileId,
    staleTime: 5 * 60 * 1000,
  });

  const pick = React.useCallback(async () => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...AVATAR_MIME_TYPES],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.mimeType || !asset.size) return;
      await attachMutation.mutateAsync({
        uri: asset.uri,
        fileName: asset.name ?? "avatar",
        contentType: asset.mimeType,
        fileSize: asset.size,
        onProgress: () => undefined,
      });
    } finally {
      setPicking(false);
    }
  }, [attachMutation]);

  if (!user) return null;
  const busy = picking || attachMutation.isPending || removeMutation.isPending;
  const avatarUrl = user.avatarFileId ? avatarUrlQuery.data : undefined;

  return (
    <View className="flex-row items-center gap-4">
      <View className="size-16 items-center justify-center overflow-hidden rounded-full bg-muted">
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} className="size-full" />
        ) : (
          <Text className="text-lg font-bold text-foreground">{initials(user.name)}</Text>
        )}
      </View>
      <View className="flex-1 gap-2">
        <Button variant="outline" loading={busy} onPress={() => void pick()}>
          {t("users.avatarChange")}
        </Button>
        {user.avatarFileId && (
          <Button
            variant="ghost"
            loading={removeMutation.isPending}
            disabled={busy}
            onPress={() => removeMutation.mutate()}
          >
            {t("users.avatarRemove")}
          </Button>
        )}
        <Text className="text-xs text-muted-foreground">{t("users.avatarHint")}</Text>
      </View>
    </View>
  );
}
