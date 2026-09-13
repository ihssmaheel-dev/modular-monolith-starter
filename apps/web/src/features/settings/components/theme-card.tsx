import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useTheme } from "@/components/theme-provider";

export function ThemeCard() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const modes = [
    { value: "light" as const, label: t("settings.lightMode"), icon: Sun },
    { value: "dark" as const, label: t("settings.darkMode"), icon: Moon },
    { value: "system" as const, label: t("settings.systemDefault"), icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance")}</CardTitle>
        <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          {modes.map((mode) => (
            <Button
              key={mode.value}
              variant={theme === mode.value ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => setTheme(mode.value)}
            >
              <mode.icon className="size-4" />
              {mode.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
