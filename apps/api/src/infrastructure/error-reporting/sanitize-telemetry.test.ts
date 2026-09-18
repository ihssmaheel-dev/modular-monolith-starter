import { describe, expect, it } from "vitest";
import { sanitizeClientUrl, sanitizeErrorText } from "./sanitize-telemetry";

describe("sanitize-telemetry", () => {
  describe("sanitizeErrorText", () => {
    it("returns undefined for null or undefined input", () => {
      expect(sanitizeErrorText(undefined)).toBeUndefined();
    });

    it("redacts Bearer tokens", () => {
      const input = "Request failed with Bearer eyJhbGciOi.eyJzdWIi.signature";
      expect(sanitizeErrorText(input)).toBe("Request failed with Bearer [REDACTED]");
    });

    it("redacts passwords, tokens, and api keys", () => {
      const input = "password=SuperSecret123; api_key=ak_live_xyz; token: abc-123";
      expect(sanitizeErrorText(input)).toBe(
        "password=[REDACTED]; api_key=[REDACTED]; token: [REDACTED]",
      );
    });

    it("redacts database connection strings", () => {
      const input = "Failed to connect to postgresql://user:pass@db.local:5432/production";
      expect(sanitizeErrorText(input)).toBe("Failed to connect to [REDACTED_CONNECTION_URL]");
    });

    it("redacts email addresses", () => {
      const input = "Failed to invite user test.user+tag@domain.co.uk";
      expect(sanitizeErrorText(input)).toBe("Failed to invite user [REDACTED_EMAIL]");
    });

    it("truncates error text to maxLength", () => {
      const input = "a".repeat(3000);
      expect(sanitizeErrorText(input, 500)?.length).toBe(500);
    });
  });

  describe("sanitizeClientUrl", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeClientUrl("")).toBe("");
      expect(sanitizeClientUrl(undefined)).toBe("");
    });

    it("redacts sensitive query parameters while preserving non-sensitive parameters", () => {
      const input = "https://example.test/accept-invitation?token=secret123&locale=en&code=456";
      const sanitized = sanitizeClientUrl(input);
      expect(sanitized).toBe(
        "https://example.test/accept-invitation?token=%5BREDACTED%5D&locale=en&code=%5BREDACTED%5D",
      );
    });

    it("handles relative path URLs with query parameters", () => {
      const input = "/auth/reset?token=my_secret_token&ref=email";
      const sanitized = sanitizeClientUrl(input);
      expect(sanitized).toBe("/auth/reset?token=%5BREDACTED%5D&ref=email");
    });

    it("leaves safe URLs untouched", () => {
      const input = "https://example.test/dashboard/notes?page=2&limit=20";
      expect(sanitizeClientUrl(input)).toBe(input);
    });
  });
});
