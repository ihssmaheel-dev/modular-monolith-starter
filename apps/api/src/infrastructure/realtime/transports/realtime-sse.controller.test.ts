import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";

import type { ResolveTenantAccessQuery } from "../../../modules/tenancy/application/queries/resolve-tenant-access.query";
import type { PinoLoggerService } from "../../logger/logger.service";
import type { RealtimeService } from "../realtime.service";
import { RealtimeSseController } from "./realtime-sse.controller";

const ACTOR = { sub: "user-1", email: "u@e.test", role: "user" } as const;

class FakeResponse extends EventEmitter {
  writableLength = 0;
  writableEnded = false;
  write = vi.fn(() => true);
  writeHead = vi.fn();
  end = vi.fn(() => {
    this.writableEnded = true;
  });
}

describe("RealtimeSseController", () => {
  let controller: RealtimeSseController;
  let realtime: RealtimeService;
  let tenantAccess: ResolveTenantAccessQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    realtime = {
      addSseClient: vi.fn().mockReturnValue(true),
      removeSseClient: vi.fn(),
    } as unknown as RealtimeService;
    tenantAccess = {
      execute: vi.fn().mockResolvedValue(ok({ mode: "multi", tenantId: "tenant-1" })),
    } as unknown as ResolveTenantAccessQuery;
    const logger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    controller = new RealtimeSseController(realtime, tenantAccess, logger);
  });

  function request(query: Record<string, unknown> = {}) {
    return { user: ACTOR, query, headers: {}, cookies: {} } as never;
  }

  function reply() {
    return { hijack: vi.fn(), raw: new FakeResponse() };
  }

  it("resolves membership and takes ownership of the response stream", async () => {
    const response = reply();
    await controller.sse(request({ tenantId: "tenant-1" }), response as never);

    expect(tenantAccess.execute).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(realtime.addSseClient).toHaveBeenCalledWith("user-1", "tenant-1", expect.anything());
    expect(response.hijack).toHaveBeenCalledOnce();
    expect(response.raw.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "content-type": "text/event-stream; charset=utf-8" }),
    );
  });

  it("rejects the stream before hijacking when tenant access is denied", async () => {
    vi.mocked(tenantAccess.execute).mockResolvedValue(
      err({ type: "MEMBERSHIP_NOT_FOUND" } as never),
    );
    const response = reply();

    await expect(
      controller.sse(request({ tenantId: "tenant-evil" }), response as never),
    ).rejects.toThrow("api.error.forbidden");

    expect(realtime.addSseClient).not.toHaveBeenCalled();
    expect(response.hijack).not.toHaveBeenCalled();
  });

  it("subscribes without a tenant when none is requested", async () => {
    await controller.sse(request(), reply() as never);

    expect(tenantAccess.execute).not.toHaveBeenCalled();
    expect(realtime.addSseClient).toHaveBeenCalledWith("user-1", undefined, expect.anything());
  });

  it("cleans up the registry when the response closes", async () => {
    const response = reply();
    await controller.sse(request(), response as never);
    response.raw.emit("close");

    expect(realtime.removeSseClient).toHaveBeenCalledWith(
      "user-1",
      undefined,
      expect.anything(),
      "client_closed",
      expect.any(Number),
    );
  });
});
