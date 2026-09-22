import { describe, expect, it, vi } from "vitest";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { DatabaseService } from "../../infrastructure/database";
import { DatabaseTransactionInterceptor } from "./database-transaction.interceptor";
import { lastValueFrom, of } from "rxjs";

describe("DatabaseTransactionInterceptor", () => {
  it("does not hold a transaction for ordinary HTTP handlers", async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const database = {
      runTransaction: vi.fn(async (callback: () => Promise<string>) => callback()),
    } as unknown as DatabaseService;
    const next = { handle: () => of("ok") } as unknown as CallHandler;
    const context = {
      getType: () => "http",
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;
    const interceptor = new DatabaseTransactionInterceptor(database, reflector);

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe("ok");
    expect(database.runTransaction).not.toHaveBeenCalled();
  });

  it("wraps only explicitly opted-in handlers", async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => key === "database_transaction"),
    } as unknown as Reflector;
    const database = {
      runTransaction: vi.fn(async (callback: () => Promise<string>) => callback()),
    } as unknown as DatabaseService;
    const next = { handle: () => of("ok") } as unknown as CallHandler;
    const context = {
      getType: () => "http",
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;
    const interceptor = new DatabaseTransactionInterceptor(database, reflector);

    await lastValueFrom(interceptor.intercept(context, next));

    expect(database.runTransaction).toHaveBeenCalledOnce();
  });
});
