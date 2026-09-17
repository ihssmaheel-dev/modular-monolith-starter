import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env";
import { TenantContextService } from "./tenant-context.service";

describe("TenantContextService", () => {
  const originalMode = env.TENANCY_MODE;
  let runWith: ReturnType<typeof vi.fn>;
  let service: TenantContextService;

  beforeEach(() => {
    env.TENANCY_MODE = "multi";
    runWith = vi.fn((_context, callback: () => unknown) => callback());
    const cls = { get: vi.fn(), runWith };
    service = new TenantContextService(cls as never);
  });

  afterEach(() => {
    env.TENANCY_MODE = originalMode;
  });

  it("always disables system scope for request-level context", () => {
    const supplied = { mode: "multi", tenantId: "tenant-a", system: true } as unknown as Parameters<
      typeof service.run
    >[0];

    service.run(supplied, () => undefined);

    expect(runWith).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a", systemScope: false }),
      expect.any(Function),
    );
  });

  it("enables system scope only through the trusted worker path", () => {
    service.runSystem({ mode: "single" }, () => undefined);

    expect(runWith).toHaveBeenCalledWith(
      expect.objectContaining({ tenantMode: "multi", systemScope: true }),
      expect.any(Function),
    );
  });
});
