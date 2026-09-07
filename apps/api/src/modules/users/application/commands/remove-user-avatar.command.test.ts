import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { RemoveUserAvatarCommand } from "./remove-user-avatar.command";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { User } from "../../domain/entities/user.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;

function user(withAvatar: boolean) {
  const next = User.fromPersistence({
    id: "user-1",
    email: "u@example.com",
    name: "U",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (withAvatar) next.setAvatar("file-1");
  return next;
}

describe("RemoveUserAvatarCommand", () => {
  let command: RemoveUserAvatarCommand;
  let getUserById: GetUserByIdQuery;
  let deleteFile: DeleteFileCommand;
  let users: UsersRepository;

  beforeEach(() => {
    getUserById = { execute: vi.fn() } as unknown as GetUserByIdQuery;
    deleteFile = { execute: vi.fn() } as unknown as DeleteFileCommand;
    users = { updateById: vi.fn() } as unknown as UsersRepository;
    command = new RemoveUserAvatarCommand(getUserById, deleteFile, users);
  });

  it("should clear the column and delete the file", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user(true)));
    vi.mocked(users.updateById).mockResolvedValue(ok(user(false)));
    vi.mocked(deleteFile.execute).mockResolvedValue(ok(undefined));

    const result = await command.execute(ACTOR);

    expect(result.isOk()).toBe(true);
    expect(users.updateById).toHaveBeenCalledWith("user-1", { avatarFileId: null });
    expect(deleteFile.execute).toHaveBeenCalledWith("file-1", ACTOR);
  });

  it("should succeed without touching storage when no avatar is set", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user(false)));

    const result = await command.execute(ACTOR);

    expect(result.isOk()).toBe(true);
    expect(users.updateById).not.toHaveBeenCalled();
    expect(deleteFile.execute).not.toHaveBeenCalled();
  });
});
