import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { RequestEmailChangeCommand } from "./request-email-change.command";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";
import { UsersRepository } from "../../infrastructure/users.repository";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { User } from "../../domain/entities/user.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const actor = {
  sub: "user-1",
  email: "old@example.com",
  role: "user",
} as AuthenticatedUser;

const user = User.fromPersistence({
  id: "user-1",
  email: "old@example.com",
  name: "User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("RequestEmailChangeCommand", () => {
  let command: RequestEmailChangeCommand;
  let getUserById: GetUserByIdQuery;
  let getUserByEmail: GetUserByEmailQuery;
  let repository: UsersRepository;
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    getUserById = { execute: vi.fn() } as unknown as GetUserByIdQuery;
    getUserByEmail = { execute: vi.fn() } as unknown as GetUserByEmailQuery;
    repository = {
      setEmailChangeRequest: vi.fn().mockResolvedValue(ok(true)),
    } as unknown as UsersRepository;
    emailService = { send: vi.fn().mockResolvedValue(ok({ id: "email-1" })) } as never;
    const i18n = { t: vi.fn((key: string) => key) } as unknown as I18nService;
    const logger = {
      child: vi.fn().mockReturnValue({ warn: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    command = new RequestEmailChangeCommand(
      getUserById,
      getUserByEmail,
      repository,
      emailService,
      i18n,
      logger,
    );
  });

  it("normalizes the address before the uniqueness check (H07)", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));

    const result = await command.execute(actor, "  New@Example.COM ");

    expect(result.isOk()).toBe(true);
    expect(getUserByEmail.execute).toHaveBeenCalledWith("new@example.com");
    expect(repository.setEmailChangeRequest).toHaveBeenCalledWith(
      "user-1",
      "new@example.com",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
    );
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@example.com" }),
    );
  });

  it("is a no-op when the address is unchanged", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));

    const result = await command.execute(actor, "OLD@example.com");

    expect(result.isOk()).toBe(true);
    expect(getUserByEmail.execute).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("rejects an address owned by someone else", async () => {
    vi.mocked(getUserById.execute).mockResolvedValue(ok(user));
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok({ ...user, id: "user-2" } as never));

    const result = await command.execute(actor, "taken@example.com");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "EMAIL_TAKEN", email: "taken@example.com" });
    }
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
