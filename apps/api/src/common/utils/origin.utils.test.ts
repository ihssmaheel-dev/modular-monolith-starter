import { describe, expect, it, vi, beforeEach } from "vitest";
import { clientOrigins, isTrustedHost, isTrustedOrigin } from "./origin.utils";

vi.mock("../../config/env", () => ({
  env: { NODE_ENV: "test", CLIENT_URL: "https://app.example.com" },
}));

describe("origin trust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives every check from CLIENT_URL", () => {
    expect(clientOrigins()).toEqual(["https://app.example.com"]);
    expect(isTrustedOrigin("https://app.example.com", true)).toBe(true);
    expect(isTrustedOrigin("https://evil.example.com", true)).toBe(false);
  });

  it("accepts loopback origins outside production only", () => {
    expect(isTrustedOrigin("http://localhost:5155", false)).toBe(true);
    expect(isTrustedOrigin("http://127.0.0.1:5156", false)).toBe(true);
    expect(isTrustedOrigin("http://localhost:5155", true)).toBe(false);
    expect(isTrustedOrigin("https://app.example.com", true)).toBe(true);
  });

  it("validates hosts for Referer checks", () => {
    expect(isTrustedHost("app.example.com", true)).toBe(true);
    expect(isTrustedHost("evil.example.com", true)).toBe(false);
    expect(isTrustedHost("localhost:5155", false)).toBe(true);
    expect(isTrustedHost("not a host !!", true)).toBe(false);
  });
});
