import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { Queue } from "bullmq";
import type { EmailJobData } from "@repo/contracts";
vi.mock("../../../../config/env", () => ({ env: { CLIENT_URL: "https://app.example.com" } }));
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { UserCreatedEvent } from "../../domain/events/user.events";
import { WelcomeEmailListener } from "./welcome-email.listener";

describe("WelcomeEmailListener", () => {
  let listener: WelcomeEmailListener;
  let queueService: QueueService;
  let emailService: EmailService;
  let queue: Queue<EmailJobData, unknown, string>;

  beforeEach(() => {
    const logger = { error: vi.fn() } as unknown as PinoLoggerService;
    queue = { add: vi.fn() } as unknown as Queue<EmailJobData, unknown, string>;
    queueService = { getQueue: vi.fn().mockReturnValue(queue) } as unknown as QueueService;
    emailService = { send: vi.fn() } as unknown as EmailService;
    const i18n = { t: vi.fn((key: string) => key) } as unknown as I18nService;
    listener = new WelcomeEmailListener(logger, queueService, emailService, i18n);
  });

  it("queues a localized welcome email with retries", async () => {
    const event = new UserCreatedEvent("user-123", "test@example.com", "Test");

    await listener.handle(event);

    expect(queue.add).toHaveBeenCalledWith(
      "welcome",
      {
        to: event.email,
        subject: "email.welcome.subject",
        html: expect.stringContaining("https://app.example.com/auth"),
      },
      {
        jobId: "welcome-email:user-123",
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
  });

  it("sends directly when Redis queues are unavailable", async () => {
    vi.mocked(queueService.getQueue).mockReturnValue(null);
    vi.mocked(emailService.send).mockResolvedValue(ok({ id: "email-1", provider: "smtp" }));

    await listener.handle(new UserCreatedEvent("user-123", "test@example.com", "Test"));

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com" }),
    );
  });
});
