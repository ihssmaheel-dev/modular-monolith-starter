import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("scopes tenant-owned domains by tenant id", () => {
    expect(queryKeys.notes.list("t-1", 1, 20)).toContain("t-1");
    expect(queryKeys.notes.detail("t-1", "n-1")).toContain("t-1");
    expect(queryKeys.notes.attachments("t-1", "n-1")).toContain("t-1");
    expect(queryKeys.users.list("t-1", 1, 20)).toContain("t-1");
    expect(queryKeys.files.list("t-1", "note", "n-1")).toContain("t-1");
  });

  it("isolates caches between tenants", () => {
    expect(queryKeys.notes.list("t-1", 1, 20)).not.toEqual(queryKeys.notes.list("t-2", 1, 20));
  });

  it("keeps privacy keys tenant-agnostic by design", () => {
    expect(queryKeys.privacy.all()).toEqual(["privacy"]);
    expect(queryKeys.privacy.requests(1, 20)).toEqual([
      "privacy",
      "requests",
      { page: 1, limit: 20 },
    ]);
  });
});
