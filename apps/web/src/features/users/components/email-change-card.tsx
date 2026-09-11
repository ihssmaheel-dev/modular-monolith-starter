import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
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
import { requestEmailChangeMutationOptions } from "@/features/users/users.mutations";

export function EmailChangeCard() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const mutation = useMutation({
    ...requestEmailChangeMutationOptions(),
    onSuccess: () => setSent(true),
    onError: () => setSent(false),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="size-4" />
          {t("users.changeEmailTitle")}
        </CardTitle>
        <CardDescription>{t("users.changeEmailDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <p className="text-sm text-muted-foreground">{t("users.changeEmailSent")}</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="change-email">{t("users.email")}</Label>
              <Input
                id="change-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mutation.isError ? (
              <p className="text-sm text-destructive">{t("users.changeEmailFailed")}</p>
            ) : null}
            <Button
              disabled={mutation.isPending || email.trim().length === 0}
              onClick={() => mutation.mutate(email.trim())}
            >
              {mutation.isPending ? t("users.confirmingEmail") : t("users.changeEmailSubmit")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
