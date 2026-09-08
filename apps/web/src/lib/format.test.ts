import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatRelativeTime } from "./format";

describe("formatDate", () => {
  it("formats the same instant per requested locale", () => {
    const value = "2026-03-15T12:00:00.000Z";
    expect(formatDate(value, "en")).toBe(new Date(value).toLocaleDateString("en"));
    expect(formatDate(value, "es")).toBe(new Date(value).toLocaleDateString("es"));
    expect(formatDate(value, "en")).not.toBe(formatDate(value, "es"));
  });
});

describe("formatDateTime", () => {
  it("includes time components for the requested locale", () => {
    const value = "2026-03-15T12:00:00.000Z";
    expect(formatDateTime(value, "en")).toBe(new Date(value).toLocaleString("en"));
  });
});

describe("formatNumber", () => {
  it("groups digits per locale", () => {
    expect(formatNumber(1234567.5, "en")).toBe(new Intl.NumberFormat("en").format(1234567.5));
    expect(formatNumber(1234567.5, "de")).toBe(new Intl.NumberFormat("de").format(1234567.5));
  });
});

describe("formatRelativeTime", () => {
  it("renders a past instant with a suffix", () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(anHourAgo, "en")).toMatch(/ago$/);
  });
});
