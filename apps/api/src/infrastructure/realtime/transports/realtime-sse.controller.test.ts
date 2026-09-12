import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { RealtimeSseController } from "./realtime-sse.controller";
import type { RealtimeService } from "../realtime.service";
import type { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import type { PinoLoggerService } from "../../logger/logger.service";

const ACTOR = { sub: "user-1", email: "u@e.test", role: "user" } as const;

describe("RealtimeSseController", () => {
  let controller: RealtimeSseController;
  let realtime: RealtimeService;
  let tenantAccess: ResolveTenantAccessQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    realtime = {
      addSseClient: vi.fn(),
      removeSseClient: vi.fn(),
    } as unknown as RealtimeService;
    tenantAccess = {
      execute: vi.fn().mockResolvedValue(ok({ mode: "multi", tenantId: "tenant-1" })),
    } as unknown as ResolveTenantAccessQuery;
    const logger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    controller = new RealtimeSseController(realtime, tenantAccess, logger);
  });

  function request(query: Record<string, unknown> = {}) {
    return { user: ACTOR, query } as never;
  }

  it("resolves membership for the ?tenantId= subscription (H16)", async () => {
    const observable = await controller.sse(request({ tenantId: "tenant-1" }));

    expect(tenantAccess.execute).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(realtime.addSseClient).toHaveBeenCalledWith("user-1", "tenant-1", expect.anything());
    expect(observable).toBeDefined();
  });

  it("degrades to the user-global scope when the tenant is unresolvable (H16)", async () => {
    vi.mocked(tenantAccess.execute).mockResolvedValue(
      err({ type: "MEMBERSHIP_NOT_FOUND" } as never),
    );

    await controller.sse(request({ tenantId: "tenant-evil" }));

    expect(realtime.addSseClient).toHaveBeenCalledWith("user-1", undefined, expect.anything());
  });

  it("subscribes without a tenant when none is requested", async () => {
    await controller.sse(request());

    expect(tenantAccess.execute).not.toHaveBeenCalled();
    expect(realtime.addSseClient).toHaveBeenCalledWith("user-1", undefined, expect.anything());
  });
});
