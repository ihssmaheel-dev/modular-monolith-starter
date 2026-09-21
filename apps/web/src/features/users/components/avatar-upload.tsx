import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "@repo/ui/components/ui/toast";
import { ImageCropperDialog } from "@repo/ui/components/composed/image-cropper-dialog";
import { AVATAR_MAX_FILE_SIZE_BYTES, AVATAR_MIME_TYPES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { useAttachAvatarMutation, useRemoveAvatarMutation } from "../avatar.mutations";
import { userAvatarQuery } from "../users.queries";

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

  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);

  const avatarUrlQuery = useQuery(userAvatarQuery(user?.avatarFileId));

  const closeCropper = () => {
    setIsCropperOpen(false);
    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
      setSelectedImageSrc(null);
    }
  };

  useEffect(() => {
    return () => {
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
      }
    };
  }, [selectedImageSrc]);

  if (!user) return null;
  const busy = attachMutation.isPending || removeMutation.isPending;
  const avatarUrl = user.avatarFileId ? avatarUrlQuery.data : undefined;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowed = (AVATAR_MIME_TYPES as readonly string[]).includes(file.type);
    if (!allowed || file.size <= 0 || file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
      toast.add({ title: t("api.user.invalidAvatar"), type: "error" } as never);
      return;
    }

    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
    }
    const objectUrl = URL.createObjectURL(file);
    setSelectedImageSrc(objectUrl);
    setIsCropperOpen(true);
  };

  const handleCropComplete = async (croppedFile: File) => {
    try {
      await attachMutation.mutateAsync({ file: croppedFile, onProgress: () => undefined });
      closeCropper();
    } catch {
      // Handled by attachMutation.onError toast
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={t("users.avatar")} />}
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
        onChange={handleFileSelect}
      />

      <ImageCropperDialog
        open={isCropperOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeCropper();
          } else {
            setIsCropperOpen(true);
          }
        }}
        imageSrc={selectedImageSrc}
        onCropComplete={handleCropComplete}
        isPending={attachMutation.isPending}
        title={t("users.cropperTitle")}
        description={t("users.cropperDescription")}
        zoomLabel={t("users.cropperZoom")}
        rotateLabel={t("users.cropperRotate")}
        resetLabel={t("users.cropperReset")}
        cancelLabel={t("users.cropperCancel")}
        applyLabel={t("users.cropperApply")}
        previewLabel={t("users.cropperPreview")}
      />
    </div>
  );
}
