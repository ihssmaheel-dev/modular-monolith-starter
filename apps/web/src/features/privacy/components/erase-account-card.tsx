import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { ConfirmDialog } from "@repo/ui/components/composed/confirm-dialog";
import { useEraseAccountMutation } from "../privacy.mutations";
import { useAuthStore } from "@/stores/auth.store";

export function EraseAccountCard() {
  const { t } = useTranslation();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const eraseMutation = useEraseAccountMutation({
    onSuccess: () => {
      setOpen(false);
      setPassword("");
      clearAuth();
      window.location.href = "/auth";
    },
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4" />
          {t("privacy.eraseAccountTitle")}
        </CardTitle>
        <CardDescription>{t("privacy.eraseAccountDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="erase-password">{t("privacy.confirmPassword")}</Label>
          <Input
            id="erase-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ConfirmDialog
          title={t("privacy.eraseAccountTitle")}
          description={t("privacy.eraseAccountDescription")}
          confirmText={t("privacy.eraseAccount")}
          cancelText={t("common.cancel")}
          pendingText={t("privacy.erasingAccount")}
          variant="destructive"
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => eraseMutation.mutateAsync(password)}
          trigger={
            <Button variant="destructive" disabled={!password || eraseMutation.isPending}>
              {t("privacy.eraseAccount")}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
