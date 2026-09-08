import { describe, expect, it, beforeEach } from "vitest";
import { getApiClient, resetApiClient } from "./api";

describe("mobile api client", () => {
  beforeEach(() => {
    resetApiClient();
  });

  it("returns a singleton client", () => {
    expect(getApiClient()).toBe(getApiClient());
  });

  it("rebuilds the client after reset", () => {
    const first = getApiClient();
    resetApiClient();

    expect(getApiClient()).not.toBe(first);
  });

  it("exposes every domain subclient", () => {
    const client = getApiClient();

    for (const domain of [
      "auth",
      "files",
      "notes",
      "notifications",
      "privacy",
      "tenancy",
      "users",
    ]) {
      expect(client).toHaveProperty(domain);
    }
  });
});
