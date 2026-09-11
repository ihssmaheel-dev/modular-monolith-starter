import { describe, it, expect, vi, beforeEach } from "vitest";
import { err, ok } from "neverthrow";
import { SendVerificationEmailCommand } from "./send-verification-email.command";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { SetEmailVerificationTokenCommand } from "../../../users/application/commands/set-email-verification-token.command";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { User } from "../../../users/domain/entities/user.entity";

describe("SendVerificationEmailCommand", () => {
  let command: SendVerificationEmailCommand;
  let getUserByEmail: GetUserByEmailQuery;
  let setToken: SetEmailVerificationTokenCommand;
  let emailService: EmailService;
  let loggerWarn: ReturnType<typeof vi.fn>;

  const verifiedUser = User.fromPersistence({
    id: "u-1",
    email: "ada@example.com",
    name: "Ada",
    role: "user",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const unverifiedUser = User.fromPersistence({
    id: "u-2",
    email: "grace@example.com",
    name: "Grace",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getUserByEmail = { execute: vi.fn() } as unknown as GetUserByEmailQuery;
    setToken = { execute: vi.fn() } as unknown as SetEmailVerificationTokenCommand;
    emailService = { send: vi.fn() } as unknown as EmailService;
    const i18n = { t: vi.fn((key: string) => key) } as unknown as I18nService;
    loggerWarn = vi.fn();
    const logger = {
      child: vi.fn().mockReturnValue({ warn: loggerWarn, info: vi.fn() }),
    } as unknown as PinoLoggerService;
    command = new SendVerificationEmailCommand(
      getUserByEmail,
      setToken,
      emailService,
      i18n,
      logger,
    );
  });

  it("stays silent for unknown addresses", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));

    const result = await command.execute("ghost@example.com");

    expect(result.isOk()).toBe(true);
    expect(setToken.execute).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("stays silent for already-verified addresses", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(verifiedUser));

    const result = await command.execute("ada@example.com");

    expect(result.isOk()).toBe(true);
    expect(setToken.execute).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("stores a hashed token and sends the verification email", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(unverifiedUser));
    vi.mocked(setToken.execute).mockResolvedValue(ok(undefined));

    const result = await command.execute("grace@example.com", "en");

    expect(result.isOk()).toBe(true);
    const [userId, tokenHash, expiresAt] = vi.mocked(setToken.execute).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(userId).toBe("u-2");
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "grace@example.com" }),
    );
    const sent = vi.mocked(emailService.send).mock.calls[0]?.[0] as { html: string };
    expect(sent.html).toContain("/verify-email?token=");
  });

  it("absorbs delivery failures without failing", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(unverifiedUser));
    vi.mocked(setToken.execute).mockResolvedValue(ok(undefined));
    vi.mocked(emailService.send).mockRejectedValue(new Error("smtp down"));

    const result = await command.execute("grace@example.com");

    expect(result.isOk()).toBe(true);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ email: "grace@example.com" }),
      "Verification email failed",
    );
  });

  it("logs returned delivery failures instead of swallowing them (H06)", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(unverifiedUser));
    vi.mocked(setToken.execute).mockResolvedValue(ok(undefined));
    vi.mocked(emailService.send).mockResolvedValue(
      err({ code: "PROVIDER_ERROR", message: "down" }) as never,
    );

    const result = await command.execute("grace@example.com");

    expect(result.isOk()).toBe(true);
    expect(loggerWarn).toHaveBeenCalledWith(
      { code: "PROVIDER_ERROR", email: "grace@example.com" },
      "Verification email failed",
    );
  });
});
