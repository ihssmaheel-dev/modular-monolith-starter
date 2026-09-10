import { describe, expect, it } from "vitest";
import { isSyncMessage, scopedChannel } from "./sync";

describe("cross-tab sync guards", () => {
  it("accepts only string-typed message objects", () => {
    expect(isSyncMessage({ type: "signed-out", userId: "u-1" })).toBe(true);
    expect(isSyncMessage(null)).toBe(false);
    expect(isSyncMessage("signed-out")).toBe(false);
    expect(isSyncMessage({ type: 42 })).toBe(false);
    expect(isSyncMessage({})).toBe(false);
  });

  it("keeps the base name for the global scope", () => {
    expect(scopedChannel("app:theme")).toBe("app:theme");
    expect(scopedChannel("app:theme", {})).toBe("app:theme");
    expect(scopedChannel("app:theme", { userId: null })).toBe("app:theme");
  });

  it("suffixes identity scope deterministically", () => {
    expect(scopedChannel("tanstack-query", { userId: "u-1", tenantId: "t-1" })).toBe(
      "tanstack-query:u-1:t-1",
    );
    expect(scopedChannel("tanstack-query", { userId: "u-1" })).toBe("tanstack-query:u-1:-");
  });
});
