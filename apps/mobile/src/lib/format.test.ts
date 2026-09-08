import { describe, expect, it, beforeEach } from "vitest";
import { useLocaleStore } from "@/stores/locale.store";
import { formatDate, formatDateTime, formatNumber } from "./format";

const NOON_UTC = "2026-03-15T12:00:00.000Z";

describe("mobile format", () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: "en" });
  });

  it("formats dates in the store locale", () => {
    expect(formatDate(NOON_UTC)).toBe(new Date(NOON_UTC).toLocaleDateString("en"));
  });

  it("lets an explicit locale override the store", () => {
    const es = formatDate(NOON_UTC, "es");
    const en = formatDate(NOON_UTC, "en");

    expect(es).not.toBe(en);
    expect(formatDate(NOON_UTC, "en")).toBe(en);
  });

  it("formats date-times with time components", () => {
    expect(formatDateTime(NOON_UTC, "en")).toBe(new Date(NOON_UTC).toLocaleString("en"));
  });

  it("marks invalid input instead of crashing", () => {
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });

  it("groups thousands per locale", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234567, "es")).not.toBe("1,234,567");
  });
});
