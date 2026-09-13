import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LOCALES, type Locale } from "@repo/i18n";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useLocaleStore } from "@/stores/locale.store";

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

export function LanguageCard() {
  const { t, i18n } = useTranslation();
  const { locale, setLocale } = useLocaleStore();

  const handleLanguageChange = (next: Locale) => {
    setLocale(next);
    void i18n.changeLanguage(next);
  };

  const activeLocale = locale || (i18n.language?.split("-")[0] as Locale) || "en";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-5" />
          {t("settings.language")}
        </CardTitle>
        <CardDescription>{t("settings.languageDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          {SUPPORTED_LOCALES.map((lng) => (
            <Button
              key={lng}
              variant={activeLocale === lng ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => handleLanguageChange(lng)}
            >
              <span className="font-semibold uppercase">{lng}</span>
              <span>{LANGUAGE_LABELS[lng]}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
