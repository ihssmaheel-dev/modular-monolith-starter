import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_LOCALE } from "@repo/i18n";
import { useLocaleStore } from "./locale.store";

describe("mobile locale store", () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: DEFAULT_LOCALE });
  });

  it("defaults to the shared default locale", () => {
    expect(useLocaleStore.getState().locale).toBe(DEFAULT_LOCALE);
  });

  it("switches locale on setLocale", () => {
    useLocaleStore.getState().setLocale("es");

    expect(useLocaleStore.getState().locale).toBe("es");
  });
});
