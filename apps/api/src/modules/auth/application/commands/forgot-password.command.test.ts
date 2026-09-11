import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
vi.mock("../../../../config/env", () => ({ env: { CLIENT_URL: "https://app.example.com" } }));
import { User } from "../../../users/domain/entities/user.entity";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { SetPasswordResetTokenCommand } from "../../../users/application/commands/set-password-reset-token.command";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { ForgotPasswordCommand } from "./forgot-password.command";

const USER = User.fromPersistence({
  id: "user-123",
  email: "test@example.com",
  name: "Test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("ForgotPasswordCommand", () => {
  let command: ForgotPasswordCommand;
  let getUserByEmail: GetUserByEmailQuery;
  let setResetToken: SetPasswordResetTokenCommand;
  let emailService: EmailService;

  beforeEach(() => {
    getUserByEmail = { execute: vi.fn() } as unknown as GetUserByEmailQuery;
    setResetToken = { execute: vi.fn() } as unknown as SetPasswordResetTokenCommand;
    emailService = { send: vi.fn() } as unknown as EmailService;
    const i18n = { t: vi.fn((key: string) => key) } as unknown as I18nService;
    command = new ForgotPasswordCommand(getUserByEmail, setResetToken, emailService, i18n);
  });

  it("does not reveal that an account is missing", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));

    const result = await command.execute("missing@example.com");

    expect(result.isOk()).toBe(true);
    expect(setResetToken.execute).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("stores a token hash before sending a localized reset email", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(USER));
    vi.mocked(setResetToken.execute).mockResolvedValue(ok(undefined));
    vi.mocked(emailService.send).mockResolvedValue(ok({ id: "email-1", provider: "smtp" }));

    const result = await command.execute(USER.email, "fr");

    expect(result.isOk()).toBe(true);
    expect(setResetToken.execute).toHaveBeenCalledWith(
      USER.id,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
    expect(emailService.send).toHaveBeenCalledWith({
      to: USER.email,
      subject: "email.passwordReset.subject",
      html: expect.stringContaining("https://app.example.com/auth/reset-password?token="),
    });
  });

  it("logs delivery failures without revealing account existence (H06)", async () => {
    const logger = {
      warn: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    const logged = new ForgotPasswordCommand(
      getUserByEmail,
      setResetToken,
      emailService,
      { t: vi.fn((key: string) => key) } as never,
      logger as never,
    );
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(USER));
    vi.mocked(setResetToken.execute).mockResolvedValue(ok(undefined));
    vi.mocked(emailService.send).mockResolvedValue(
      err({ code: "PROVIDER_ERROR", message: "down" }) as never,
    );

    const result = await logged.execute(USER.email);

    expect(result.isOk()).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      { code: "PROVIDER_ERROR", email: USER.email },
      "Password reset email failed",
    );
  });
});
