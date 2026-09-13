import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { GetCurrentUserQuery } from "./get-current-user.query";
import type { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";

describe("GetCurrentUserQuery", () => {
  let query: GetCurrentUserQuery;
  const mockExecute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query = new GetCurrentUserQuery({ execute: mockExecute } as unknown as GetUserByIdQuery);
  });

  it("should return USER_NOT_FOUND when user is missing or lookup fails", async () => {
    mockExecute.mockResolvedValue(err({ type: "USER_NOT_FOUND" }));

    const result = await query.execute("user-1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "USER_NOT_FOUND" });
    }
  });

  it("should return mapped user details when found", async () => {
    const user = {
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
      role: "user" as const,
      avatarFileId: null,
      authVersion: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    };
    mockExecute.mockResolvedValue(ok(user));

    const result = await query.execute("user-1");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(user);
    }
  });
});
