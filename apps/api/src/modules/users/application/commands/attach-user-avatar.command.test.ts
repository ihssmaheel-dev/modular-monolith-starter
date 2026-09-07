import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { AttachUserAvatarCommand } from "./attach-user-avatar.command";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { GetFileByIdQuery } from "../../../files/application/queries/get-file-by-id.query";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";
import { UsersRepository } from "../../infrastructure/users.repository";
import { User } from "../../domain/entities/user.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;

function user() {
  return User.fromPersistence({
    id: "user-1",
    email: "u@example.com",
    name: "U",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    key: "general/user-1/a.png",
    fileName: "a.png",
    contentType: "image/png",
    fileSize: 1024,
    bucket: "b",
    parentType: "general",
    uploadedBy: "user-1",
    status: "uploading",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AttachUserAvatarCommand", () => {
  let command: AttachUserAvatarCommand;
  let getUserById: GetUserByIdQuery;
  let getFileById: GetFileByIdQuery;
  let linkFile: LinkFileCommand;
  let deleteFile: DeleteFileCommand;
  let users: UsersRepository;

  beforeEach(() => {
    getUserById = { execute: vi.fn() } as unknown as GetUserByIdQuery;
    getFileById = { execute: vi.fn() } as unknown as GetFileByIdQuery;
    linkFile = { execute: vi.fn() } as unknown as LinkFileCommand;
    deleteFile = { execute: vi.fn() } as unknown as DeleteFileCommand;
    users = { updateById: vi.fn() } as unknown as UsersRepository;
    command = new AttachUserAvatarCommand(
      getUserById,
      getFileById,
      linkFile,
      deleteFile,
      users,
    );
  });

  it("should link the image and store its id on the user", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user()));
    vi.mocked(getFileById.execute).mockResolvedValue(ok(file() as never));
    vi.mocked(linkFile.execute).mockResolvedValue(ok(file({ parentType: "user" }) as never));
    vi.mocked(users.updateById).mockResolvedValue(ok(user()));

    const result = await command.execute(ACTOR, "file-1");

    expect(result.isOk()).toBe(true);
    expect(linkFile.execute).toHaveBeenCalledWith(
      "file-1",
      { parentType: "user", parentId: "user-1", slot: "avatar" },
      ACTOR,
    );
    expect(users.updateById).toHaveBeenCalledWith("user-1", { avatarFileId: "file-1" });
    expect(deleteFile.execute).not.toHaveBeenCalled();
  });

  it("should delete the previous avatar when replacing it", async () => {
    const withAvatar = user();
    withAvatar.setAvatar("old-file");
    vi.mocked(getUserById.execute).mockResolvedValue(ok(withAvatar));
    vi.mocked(getFileById.execute).mockResolvedValue(ok(file() as never));
    vi.mocked(linkFile.execute).mockResolvedValue(ok(file() as never));
    vi.mocked(deleteFile.execute).mockResolvedValue(ok(undefined));
    vi.mocked(users.updateById).mockResolvedValue(ok(user()));

    const result = await command.execute(ACTOR, "file-1");

    expect(result.isOk()).toBe(true);
    expect(deleteFile.execute).toHaveBeenCalledWith("old-file", ACTOR);
  });

  it("should reject non-image files", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user()));
    vi.mocked(getFileById.execute).mockResolvedValue(
      ok(file({ contentType: "application/pdf" }) as never),
    );

    const result = await command.execute(ACTOR, "file-1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("INVALID_AVATAR_FILE");
    expect(linkFile.execute).not.toHaveBeenCalled();
  });

  it("should reject oversized images", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user()));
    vi.mocked(getFileById.execute).mockResolvedValue(
      ok(file({ fileSize: 6 * 1024 * 1024 }) as never),
    );

    const result = await command.execute(ACTOR, "file-1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("INVALID_AVATAR_FILE");
  });

  it("should reject files owned by another user", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user()));
    vi.mocked(getFileById.execute).mockResolvedValue(ok(file({ uploadedBy: "user-2" }) as never));

    const result = await command.execute(ACTOR, "file-1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("INVALID_AVATAR_FILE");
  });
});
