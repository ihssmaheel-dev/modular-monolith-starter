import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "@repo/i18n";
import { useLocaleStore } from "@/stores/locale.store";
import { createBroadcastChannel, type BroadcastHandle } from "./channel";

export const LOCALE_SYNC_CHANNEL = "app:locale";
export type LocaleSyncEvent = { type: "locale-changed"; locale: Locale };

export function LocaleSync() {
  const { i18n } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const mounted = useRef(false);
  const channelRef = useRef<BroadcastHandle<LocaleSyncEvent> | null>(null);

  useEffect(() => {
    const channel = createBroadcastChannel<LocaleSyncEvent>(LOCALE_SYNC_CHANNEL);
    channelRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "locale-changed" || !SUPPORTED_LOCALES.includes(message.locale)) return;
      useLocaleStore.getState().setLocale(message.locale);
      void i18n.changeLanguage(message.locale);
    });
    return () => {
      channelRef.current = null;
      unsubscribe();
      channel.close();
    };
  }, [i18n]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    channelRef.current?.post({ type: "locale-changed", locale });
  }, [locale]);

  return null;
}
