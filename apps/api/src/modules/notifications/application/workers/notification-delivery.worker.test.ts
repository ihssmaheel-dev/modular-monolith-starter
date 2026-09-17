import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { NotificationDeliveryWorker } from "./notification-delivery.worker";
import type { DeliveryIntentsRepository } from "../../infrastructure/repositories/delivery-intents.repository";
import type { DeviceTokensRepository } from "../../infrastructure/repositories/device-tokens.repository";
import type { PushDriverFactory } from "../../infrastructure/push/push.factory";
import type { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import type { EmailService } from "../../../../infrastructure/email/email.service";
import type { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

describe("NotificationDeliveryWorker", () => {
  let worker: NotificationDeliveryWorker;
  let intents: DeliveryIntentsRepository;
  let devices: DeviceTokensRepository;
  let push: PushDriverFactory;
  let users: GetUserByIdQuery;
  let email: EmailService;
  let i18n: I18nService;
  let database: DatabaseService;
  let tenantContext: TenantContextService;
  let metrics: MetricsService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    intents = {
      getBacklogStats: vi.fn().mockResolvedValue({
        pending: 2,
        dead: 0,
        oldestPendingAt: new Date(Date.now() - 5000),
      }),
      claimBatch: vi.fn().mockResolvedValue([]),
      findNotification: vi.fn().mockResolvedValue({
        titleKey: "notification.welcome",
        titleParams: {},
      }),
      markDelivered: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as DeliveryIntentsRepository;

    devices = {
      findByUser: vi.fn().mockResolvedValue(ok([])),
      deleteByUserAndToken: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as DeviceTokensRepository;

    push = {
      get: vi.fn().mockReturnValue({
        provider: "expo",
        send: vi.fn().mockResolvedValue([{ status: "sent" }]),
      }),
    } as unknown as PushDriverFactory;

    users = {
      execute: vi.fn().mockResolvedValue(ok({ id: "user-1", email: "test@example.com" })),
    } as unknown as GetUserByIdQuery;

    email = {
      send: vi.fn().mockResolvedValue(ok({ messageId: "msg-1" })),
    } as unknown as EmailService;

    i18n = {
      t: vi.fn().mockReturnValue("Translated Title"),
    } as unknown as I18nService;

    database = {
      runTransaction: vi.fn(async (fn: () => unknown) => await fn()),
    } as unknown as DatabaseService;

    tenantContext = {
      runSystem: vi.fn(
        async (_ctx: unknown, fn: () => unknown) => await (fn as () => Promise<unknown>)(),
      ),
    } as unknown as TenantContextService;

    metrics = {
      setGauge: vi.fn(),
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;

    worker = new NotificationDeliveryWorker(
      intents,
      devices,
      push,
      users,
      email,
      i18n,
      database,
      tenantContext,
      metrics,
      logger,
    );
  });

  it("throttles getBacklogStats to run at most once every 60 seconds", async () => {
    await worker.deliverPending();
    expect(intents.getBacklogStats).toHaveBeenCalledTimes(1);
    expect(metrics.setGauge).toHaveBeenCalledWith(
      "notification_delivery_pending_depth",
      expect.any(String),
      2,
    );

    // Immediate second invocation should not re-query backlog stats
    await worker.deliverPending();
    expect(intents.getBacklogStats).toHaveBeenCalledTimes(1);
    expect(intents.claimBatch).toHaveBeenCalledTimes(2);
  });
});
