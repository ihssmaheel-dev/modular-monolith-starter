import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
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
import { useEraseOrganizationMutation } from "../privacy.mutations";
import { useTenantStore } from "@/stores/tenant.store";

export function EraseOrganizationCard() {
  const { t } = useTranslation();
  const tenantId = useTenantStore((state) => state.tenantId);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const eraseMutation = useEraseOrganizationMutation();

  if (!tenantId) return null;

  const confirm = async () => {
    await eraseMutation.mutateAsync({ organizationId: tenantId, confirmationName: confirmation });
    setOpen(false);
    setConfirmation("");
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Building2 className="size-4" />
          {t("privacy.eraseOrgTitle")}
        </CardTitle>
        <CardDescription>{t("privacy.eraseOrgDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="erase-org-name">{t("privacy.typeOrgName")}</Label>
          <Input
            id="erase-org-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </div>
        <ConfirmDialog
          title={t("privacy.eraseOrgTitle")}
          description={t("privacy.eraseOrgDescription")}
          confirmText={t("privacy.eraseAccount")}
          cancelText={t("common.cancel")}
          pendingText={t("privacy.erasingAccount")}
          variant="destructive"
          open={open}
          onOpenChange={setOpen}
          onConfirm={confirm}
          trigger={
            <Button variant="destructive" disabled={!confirmation || eraseMutation.isPending}>
              {t("privacy.eraseOrgTitle")}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
