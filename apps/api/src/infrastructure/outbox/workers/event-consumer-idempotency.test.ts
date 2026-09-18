import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WelcomeEmailListener } from "../../../modules/users/application/listeners/welcome-email.listener";
import { InvitationEmailListener } from "../../../modules/tenancy/application/listeners/invitation-email.listener";
import type { QueueService } from "../../queue/queue.service";
import type { EmailService } from "../../email/email.service";
import type { I18nService } from "../../i18n/i18n.service";
import type { PinoLoggerService } from "../../logger/logger.service";
import type { OutboxEventMetadata } from "@repo/contracts";

describe("Event-Consumer Idempotency Contract", () => {
  let mockQueue: { add: ReturnType<typeof vi.fn> };
  let mockQueueService: QueueService;
  let mockEmailService: EmailService;
  let mockI18n: I18nService;
  let mockLogger: PinoLoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = {
      add: vi.fn().mockResolvedValue({}),
    };
    mockQueueService = {
      getQueue: vi.fn().mockReturnValue(mockQueue),
    } as unknown as QueueService;
    mockEmailService = {
      send: vi.fn(),
    } as unknown as EmailService;
    mockI18n = {
      t: vi.fn((key: string) => key),
    } as unknown as I18nService;
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as PinoLoggerService;
  });

  it("welcome email listener uses meta.eventId as stable deduplication key when provided", async () => {
    const listener = new WelcomeEmailListener(
      mockLogger,
      mockQueueService,
      mockEmailService,
      mockI18n,
    );

    const eventPayload = {
      userId: "user-123",
      email: "user@example.com",
      name: "Alice",
      locale: "en" as const,
    };
    const meta: OutboxEventMetadata = {
      eventId: "outbox-evt-789",
      topic: "user.created",
      tenantId: "tenant-abc",
    };

    await listener.handle(eventPayload, meta);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      "welcome",
      expect.anything(),
      expect.objectContaining({
        jobId: "welcome-email-outbox-evt-789",
      }),
    );
  });

  it("welcome email listener falls back to userId when meta is not provided", async () => {
    const listener = new WelcomeEmailListener(
      mockLogger,
      mockQueueService,
      mockEmailService,
      mockI18n,
    );

    const eventPayload = {
      userId: "user-123",
      email: "user@example.com",
      name: "Alice",
      locale: "en" as const,
    };

    await listener.handle(eventPayload);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      "welcome",
      expect.anything(),
      expect.objectContaining({
        jobId: "welcome-email-user-123",
      }),
    );
  });

  it("invitation email listener uses meta.eventId for stable deduplication across retries", async () => {
    const listener = new InvitationEmailListener(
      mockQueueService,
      mockEmailService,
      mockI18n,
      mockLogger,
    );

    const eventPayload = {
      tenantId: "tenant-abc",
      organizationName: "Acme Corp",
      email: "invitee@example.com",
      role: "member" as const,
      token: "secret-token-xyz",
      locale: "en" as const,
    };
    const meta: OutboxEventMetadata = {
      eventId: "outbox-evt-inv-456",
      topic: "tenancy.invitation.created",
      tenantId: "tenant-abc",
    };

    // First delivery attempt
    await listener.handle(eventPayload, meta);

    // Redelivery / retry attempt with same outbox event
    await listener.handle(eventPayload, meta);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    // Both calls generated identical BullMQ jobId, allowing queue-level deduplication
    expect(mockQueue.add.mock.calls[0]?.[2]?.jobId).toBe("invitation-email-outbox-evt-inv-456");
    expect(mockQueue.add.mock.calls[1]?.[2]?.jobId).toBe("invitation-email-outbox-evt-inv-456");
  });

  it("EventEmitter2 dispatches event payload and metadata to registered listeners", async () => {
    const emitter = new EventEmitter2();
    const receivedCalls: Array<{ payload: unknown; meta: unknown }> = [];

    emitter.on("user.created", (payload, meta) => {
      receivedCalls.push({ payload, meta });
    });

    const payload = { userId: "user-999" };
    const meta = { eventId: "outbox-123", topic: "user.created" };

    await emitter.emitAsync("user.created", payload, meta);

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0]?.payload).toEqual(payload);
    expect(receivedCalls[0]?.meta).toEqual(meta);
  });
});
