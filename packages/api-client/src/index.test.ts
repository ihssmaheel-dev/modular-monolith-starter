import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

describe("REST compatibility request isolation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not refresh a new account when the previous account's request returns 401", async () => {
    let identity = "user-a";
    const fetch = vi.fn(async () => {
      identity = "user-b";
      return new Response(null, { status: 401 });
    });
    vi.stubGlobal("fetch", fetch);
    const onAuthFailure = vi.fn();
    const client = createApiClient("https://api.test/api/v1", {
      getAuthIdentity: () => identity,
      onAuthFailure,
    });

    const response = await client.telemetry.reportClientError({ message: "test", url: "/" });

    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledOnce();
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});
