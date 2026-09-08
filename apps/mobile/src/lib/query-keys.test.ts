import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

const TENANT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("mobile query keys", () => {
  it("scopes every notes key to the tenant", () => {
    expect(queryKeys.notes.all(TENANT)).toEqual(["notes", TENANT]);
    expect(queryKeys.notes.list(TENANT, 1, 20)).toEqual([
      "notes",
      TENANT,
      "list",
      { page: 1, limit: 20 },
    ]);
    expect(queryKeys.notes.detail(TENANT, "n-1")).toEqual(["notes", TENANT, "detail", "n-1"]);
    expect(queryKeys.notes.attachments(TENANT, "n-1")).toEqual([
      "notes",
      TENANT,
      "detail",
      "n-1",
      "attachments",
    ]);
  });

  it("scopes users and files keys to the tenant", () => {
    expect(queryKeys.users.all(TENANT)).toEqual(["users", TENANT]);
    expect(queryKeys.users.list(TENANT, 1, 20)[1]).toBe(TENANT);
    expect(queryKeys.files.all(TENANT)).toEqual(["files", TENANT]);
    expect(queryKeys.files.list(TENANT, "note", "n-1")).toEqual([
      "files",
      TENANT,
      "list",
      { parentType: "note", parentId: "n-1" },
    ]);
  });

  it("keeps privacy and notifications keys tenant-global", () => {
    expect(queryKeys.privacy.all()).toEqual(["privacy"]);
    expect(queryKeys.privacy.requests(1, 20)).toEqual([
      "privacy",
      "requests",
      { page: 1, limit: 20 },
    ]);
    expect(queryKeys.notifications.all()).toEqual(["notifications"]);
    expect(queryKeys.notifications.preferences()).toEqual(["notifications", "preferences"]);
  });
});
