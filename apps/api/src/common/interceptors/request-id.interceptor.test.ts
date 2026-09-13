import { ExecutionContext, CallHandler } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { firstValueFrom, of } from "rxjs";
import { ClsService } from "nestjs-cls";
import { RequestIdInterceptor } from "./request-id.interceptor";
import { REQUEST_ID_HEADER } from "../utils/request-id.utils";

describe("RequestIdInterceptor", () => {
  it("sets requestId when CLS is active and clears on finalize", async () => {
    const cls = {
      isActive: vi.fn().mockReturnValue(true),
      set: vi.fn(),
    } as unknown as ClsService;

    const request = { headers: { [REQUEST_ID_HEADER]: "req-123" } };
    const response = { header: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    const interceptor = new RequestIdInterceptor(cls);
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    await firstValueFrom(interceptor.intercept(context, next));

    expect(cls.set).toHaveBeenCalledWith("requestId", "req-123");
    expect(response.header).toHaveBeenCalledWith(REQUEST_ID_HEADER, "req-123");
    expect(cls.set).toHaveBeenCalledWith("requestId", undefined);
  });

  it("does not throw when CLS context is inactive during finalize", async () => {
    let active = true;
    const cls = {
      isActive: vi.fn(() => active),
      set: vi.fn(() => {
        if (!active) throw new Error("No CLS context available");
      }),
    } as unknown as ClsService;

    const request = { headers: {} };
    const response = { header: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    const interceptor = new RequestIdInterceptor(cls);
    const next = {
      handle: () => {
        active = false;
        return of({ ok: true });
      },
    } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      ok: true,
    });
  });
});
