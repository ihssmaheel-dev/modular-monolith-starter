import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { AVATAR_MIME_TYPES } from "@repo/contracts";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
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
  const user = useAuthStore((state) => state.user);
  const inputRef = useRef<HTMLInputElement>(null);
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

  if (!user) return null;
  const busy = attachMutation.isPending || removeMutation.isPending;

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {avatarUrlQuery.data && <AvatarImage src={avatarUrlQuery.data} alt={t("users.avatar")} />}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-3.5" />
            {t("users.avatarChange")}
          </Button>
          {user.avatarFileId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => removeMutation.mutate()}
            >
              {t("users.avatarRemove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("users.avatarHint")}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={AVATAR_MIME_TYPES.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) attachMutation.mutate({ file, onProgress: () => undefined });
        }}
      />
    </div>
  );
}
