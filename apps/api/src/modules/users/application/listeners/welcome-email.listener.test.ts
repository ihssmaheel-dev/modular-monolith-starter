import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { EmailJobData } from "@repo/contracts";
vi.mock("../../../../config/env", () => ({
  env: { APP_NAME: "Acme Portal", CLIENT_URL: "https://app.example.com" },
}));
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { UserCreatedEvent } from "../../domain/events/user.events";
import { WelcomeEmailListener } from "./welcome-email.listener";

describe("WelcomeEmailListener", () => {
  let listener: WelcomeEmailListener;
  let queueService: QueueService;
  let queue: Queue<EmailJobData, unknown, string>;
  let i18n: I18nService;

  beforeEach(() => {
    const logger = { error: vi.fn() } as unknown as PinoLoggerService;
    queue = { add: vi.fn() } as unknown as Queue<EmailJobData, unknown, string>;
    queueService = { getQueue: vi.fn().mockReturnValue(queue) } as unknown as QueueService;
    i18n = { t: vi.fn((key: string) => key) } as unknown as I18nService;
    listener = new WelcomeEmailListener(logger, queueService, i18n);
  });

  it("queues a localized welcome email with retries", async () => {
    const event = new UserCreatedEvent("user-123", "test@example.com", "Test");

    await listener.handle(event);

    expect(queue.add).toHaveBeenCalledWith(
      "welcome",
      {
        to: event.email,
        subject: "email.welcome.subject",
        html: expect.stringContaining("https://app.example.com/login"),
        operationId: "welcome-email-user-123",
      },
      {
        jobId: "welcome-email-user-123",
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 691_200, count: 10_000 },
        removeOnFail: { age: 691_200, count: 10_000 },
      },
    );
    expect(i18n.t).toHaveBeenCalledWith("email.welcome.subject", "en", {
      appName: "Acme Portal",
    });
  });

  it("returns a retryable failure when Redis queues are unavailable", async () => {
    vi.mocked(queueService.getQueue).mockReturnValue(null);

    const result = await listener.handle(
      new UserCreatedEvent("user-123", "test@example.com", "Test"),
    );

    expect(result.isErr()).toBe(true);
  });
});
