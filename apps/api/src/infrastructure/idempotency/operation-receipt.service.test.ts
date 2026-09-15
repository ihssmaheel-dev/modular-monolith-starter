import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationReceiptService } from "./operation-receipt.service";
import type { DatabaseService } from "../database";
import type { OperationReceiptRepository } from "./operation-receipt.repository";

const IDENTITY = {
  operationId: "request-1",
  operationType: "invoice.create",
  scopeId: "tenant-1",
  actorId: "user-1",
  tenantId: "tenant-1",
  requestHash: "sha256",
};

describe("OperationReceiptService", () => {
  let database: DatabaseService;
  let repository: OperationReceiptRepository;
  let service: OperationReceiptService;

  beforeEach(() => {
    database = { getTx: vi.fn().mockReturnValue({}) } as unknown as DatabaseService;
    repository = {
      createIfAbsent: vi.fn().mockResolvedValue(true),
      find: vi.fn(),
      complete: vi.fn().mockResolvedValue(true),
    } as unknown as OperationReceiptRepository;
    service = new OperationReceiptService(database, repository);
  });

  it("requires the business transaction", async () => {
    vi.mocked(database.getTx).mockReturnValue(undefined);

    const result = await service.claim(IDENTITY);

    expect(result.isErr() && result.error.type).toBe("TRANSACTION_REQUIRED");
  });

  it("claims a new operation", async () => {
    const result = await service.claim(IDENTITY);

    expect(result.isOk() && result.value.state).toBe("CLAIMED");
  });

  it("replays a completed operation with the same request hash", async () => {
    vi.mocked(repository.createIfAbsent).mockResolvedValue(false);
    vi.mocked(repository.find).mockResolvedValue({
      ...IDENTITY,
      id: "receipt-1",
      status: "COMPLETED",
      result: { id: "invoice-1" },
    } as never);

    const result = await service.claim(IDENTITY);

    expect(result.isOk() && result.value).toEqual({
      state: "COMPLETED",
      result: { id: "invoice-1" },
    });
  });

  it("rejects reuse with a different payload", async () => {
    vi.mocked(repository.createIfAbsent).mockResolvedValue(false);
    vi.mocked(repository.find).mockResolvedValue({ requestHash: "other" } as never);

    const result = await service.claim(IDENTITY);

    expect(result.isErr() && result.error.type).toBe("OPERATION_ID_REUSED");
  });

  it("bounds stored replay payloads", async () => {
    const result = await service.complete("receipt-1", "x".repeat(256 * 1024));

    expect(result.isErr() && result.error.type).toBe("OPERATION_RESULT_TOO_LARGE");
    expect(repository.complete).not.toHaveBeenCalled();
  });
});
