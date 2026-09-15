import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { PrivacyExportWorker } from "./privacy-export.worker";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import type { RequestExportCommand } from "../commands/request-export.command";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

function claimed(attempts = 1) {
  return DsrRequest.fromPersistence({
    id: "export-1",
    type: "EXPORT",
    status: "PROCESSING",
    subjectUserId: "user-1",
    attempts,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("PrivacyExportWorker", () => {
  let repository: PrivacyRepository;
  let command: RequestExportCommand;
  let worker: PrivacyExportWorker;

  beforeEach(() => {
    repository = {
      expireAbandonedExports: vi.fn().mockResolvedValue(0),
      getExportBacklogStats: vi
        .fn()
        .mockResolvedValue({ pending: 1, failed: 0, oldestPendingAt: null }),
      claimExportBatch: vi.fn().mockResolvedValue([claimed()]),
      markExportAttemptFailed: vi.fn().mockResolvedValue(ok(claimed())),
    } as unknown as PrivacyRepository;
    command = {
      process: vi.fn().mockResolvedValue(ok(claimed())),
    } as unknown as RequestExportCommand;
    const database = {
      runTransaction: vi.fn((operation: () => unknown) => operation()),
    } as unknown as DatabaseService;
    const tenantContext = {
      runSystem: vi.fn((_context: unknown, operation: () => unknown) => operation()),
    } as unknown as TenantContextService;
    const metrics = {
      setGauge: vi.fn(),
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn() }),
    } as unknown as PinoLoggerService;
    worker = new PrivacyExportWorker(repository, command, database, tenantContext, metrics, logger);
  });

  it("claims and completes queued exports", async () => {
    await worker.processPending();

    expect(repository.claimExportBatch).toHaveBeenCalledWith(10);
    expect(command.process).toHaveBeenCalledWith(expect.objectContaining({ id: "export-1" }));
  });

  it("returns transient failures to the queue", async () => {
    vi.mocked(command.process).mockResolvedValue(err({ type: "EXPORT_FAILED" }));

    await worker.processPending();

    expect(repository.markExportAttemptFailed).toHaveBeenCalledWith("export-1", false);
  });

  it("marks the last failed attempt terminal", async () => {
    vi.mocked(repository.claimExportBatch).mockResolvedValue([claimed(3)]);
    vi.mocked(command.process).mockResolvedValue(err({ type: "EXPORT_FAILED" }));

    await worker.processPending();

    expect(repository.markExportAttemptFailed).toHaveBeenCalledWith("export-1", true);
  });
});
