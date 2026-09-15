import { render } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, i18n } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale.store";
import { createBroadcastChannel } from "./channel";
import { LOCALE_SYNC_CHANNEL, LocaleSync, type LocaleSyncEvent } from "./locale-sync";

describe("locale sync", () => {
  beforeEach(async () => {
    localStorage.clear();
    useLocaleStore.setState({ locale: "en" });
    await i18n.changeLanguage("en");
  });

  it("applies valid remote locale changes", async () => {
    render(
      <I18nProvider>
        <LocaleSync />
      </I18nProvider>,
    );
    const remote = createBroadcastChannel<LocaleSyncEvent>(LOCALE_SYNC_CHANNEL);

    await act(async () => {
      remote.post({ type: "locale-changed", locale: "fr" });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await vi.waitFor(() => expect(useLocaleStore.getState().locale).toBe("fr"));
    expect(i18n.language).toBe("fr");
    remote.close();
  });

  it("publishes local locale changes", async () => {
    render(
      <I18nProvider>
        <LocaleSync />
      </I18nProvider>,
    );
    const remote = createBroadcastChannel<LocaleSyncEvent>(LOCALE_SYNC_CHANNEL);
    const seen: LocaleSyncEvent[] = [];
    const unsubscribe = remote.subscribe((event) => seen.push(event));

    act(() => useLocaleStore.getState().setLocale("es"));

    await vi.waitFor(() => expect(seen).toEqual([{ type: "locale-changed", locale: "es" }]));
    unsubscribe();
    remote.close();
  });
});
