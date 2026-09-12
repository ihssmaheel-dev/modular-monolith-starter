import { describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies";

describe("auth cookies", () => {
  it("scopes the refresh cookie to every API transport", () => {
    const reply = mockReply();

    setAuthCookies(reply, "access", "refresh");

    expect(reply.setCookie).toHaveBeenNthCalledWith(
      1,
      "access_token",
      "access",
      expect.objectContaining({ path: "/api" }),
    );
    expect(reply.setCookie).toHaveBeenNthCalledWith(
      2,
      "refresh_token",
      "refresh",
      expect.objectContaining({ path: "/api" }),
    );
  });

  it("clears cookies with the same paths used when setting them", () => {
    const reply = mockReply();

    clearAuthCookies(reply);

    expect(reply.clearCookie).toHaveBeenNthCalledWith(
      1,
      "access_token",
      expect.objectContaining({ path: "/api" }),
    );
    expect(reply.clearCookie).toHaveBeenNthCalledWith(
      2,
      "refresh_token",
      expect.objectContaining({ path: "/api" }),
    );
  });
});

function mockReply(): FastifyReply {
  return {
    setCookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}
