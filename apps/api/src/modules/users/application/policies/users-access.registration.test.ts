import { describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { UsersModule } from "../../users.module";
import {
  FileAccessRegistry,
  type FileAccessResource,
} from "../../../../common/file-access/file-access.registry";
import type { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { AVATAR_SLOT, type AuthenticatedUser } from "@repo/contracts";

const ACTOR: AuthenticatedUser = { sub: "user-1", email: "user@example.com", role: "user" };
const OTHER_ACTOR: AuthenticatedUser = { sub: "user-2", email: "other@example.com", role: "user" };
const ADMIN_ACTOR: AuthenticatedUser = {
  sub: "admin-1",
  email: "admin@example.com",
  role: "admin",
};

function createFile(parentId?: string, slot?: string | null): FileAccessResource {
  return {
    id: "file-1",
    parentId,
    parentType: "user",
    uploadedBy: parentId ?? "user-1",
    slot,
  };
}

describe("UsersModule file access registration", () => {
  function setup() {
    const registry = new FileAccessRegistry();
    const getUserById = { execute: vi.fn() } as unknown as GetUserByIdQuery;
    const module = new UsersModule(registry, getUserById);
    module.onModuleInit();
    return { registry, getUserById };
  }

  it("registers a user readability checker", () => {
    const { registry } = setup();
    const checker = registry.getChecker("user");
    expect(checker).toBeDefined();
  });

  it("allows access when actor is the parent user", async () => {
    const { registry } = setup();
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile("user-1"), ACTOR);
    expect(allowed).toBe(true);
  });

  it("allows access when actor is an admin", async () => {
    const { registry } = setup();
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile("user-1"), ADMIN_ACTOR);
    expect(allowed).toBe(true);
  });

  it("allows access to user avatar slot for any authenticated user", async () => {
    const { registry } = setup();
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile("user-1", AVATAR_SLOT), OTHER_ACTOR);
    expect(allowed).toBe(true);
  });

  it("allows access if target user has this file currently linked as avatarFileId", async () => {
    const { registry, getUserById } = setup();
    vi.mocked(getUserById.execute).mockResolvedValue(
      ok({ id: "user-1", avatarFileId: "file-1" } as never),
    );
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile("user-1", null), OTHER_ACTOR);
    expect(allowed).toBe(true);
    expect(getUserById.execute).toHaveBeenCalledWith("user-1");
  });

  it("denies access to non-avatar file when actor is another user and not linked as avatar", async () => {
    const { registry, getUserById } = setup();
    vi.mocked(getUserById.execute).mockResolvedValue(
      ok({ id: "user-1", avatarFileId: "other-file" } as never),
    );
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile("user-1", "private-doc"), OTHER_ACTOR);
    expect(allowed).toBe(false);
  });

  it("denies when parentId is missing", async () => {
    const { registry } = setup();
    const checker = registry.getChecker("user")!;
    const allowed = await checker(createFile(undefined), ACTOR);
    expect(allowed).toBe(false);
  });
});
