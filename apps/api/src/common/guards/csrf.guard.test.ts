import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import { CsrfGuard } from "./csrf.guard";
import { ForbiddenException, ExecutionContext } from "@nestjs/common";

describe("CsrfGuard", () => {
  let guard: CsrfGuard;
  let mockReflector: Reflector;

  const createMockContext = (request: Record<string, unknown>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;

    guard = new CsrfGuard(mockReflector);
  });

  it("allows safe HTTP methods (GET, HEAD, OPTIONS) without tokens", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const context = createMockContext({ method });
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it("allows public endpoints", () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(true);
    const context = createMockContext({ method: "POST" });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows mutating requests carrying Bearer authorization header", () => {
    const context = createMockContext({
      method: "POST",
      headers: { authorization: "Bearer valid-jwt-token" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws ForbiddenException when cookie auth is used but CSRF tokens are missing", () => {
    const context = createMockContext({
      method: "POST",
      cookies: { access_token: "jwt-cookie" },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when CSRF token header does not match cookie", () => {
    const context = createMockContext({
      method: "POST",
      cookies: { "XSRF-TOKEN": "token-12345" },
      headers: { "x-xsrf-token": "token-wrongg" },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows mutating requests when CSRF token header matches cookie", () => {
    const context = createMockContext({
      method: "POST",
      cookies: { "XSRF-TOKEN": "secure-csrf-token-123" },
      headers: { "x-xsrf-token": "secure-csrf-token-123" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("accepts the alternate cookie and header names (H08)", () => {
    const context = createMockContext({
      method: "POST",
      cookies: { xsrf_token: "token-123", refresh_token: "jwt" },
      headers: { "x-csrf-token": "token-123" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("requires tokens on public routes once auth cookies are present (H08)", () => {
    vi.mocked(mockReflector.getAllAndOverride).mockReturnValue(true);
    const context = createMockContext({
      method: "POST",
      cookies: { access_token: "jwt" },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
