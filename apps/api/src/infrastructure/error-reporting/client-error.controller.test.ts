import { describe, expect, it, vi } from "vitest";
import { ClientErrorController } from "./client-error.controller";
import type { PinoLoggerService } from "../logger/logger.service";

describe("ClientErrorController", () => {
  it("logs client error payload at warn level", () => {
    const warnMock = vi.fn();
    const childMock = vi.fn().mockReturnValue({ warn: warnMock });
    const mockLogger = { child: childMock } as unknown as PinoLoggerService;

    const controller = new ClientErrorController(mockLogger);
    controller.reportClientError({
      message: "Uncaught TypeError: Cannot read properties of undefined",
      errorRef: "c-a1b2c3",
      url: "/dashboard",
      stack: "TypeError: ...\n    at Component",
      userAgent: "Mozilla/5.0",
    });

    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "client-browser",
        errorRef: "c-a1b2c3",
        clientUrl: "/dashboard",
        userAgent: "Mozilla/5.0",
      }),
      "Client-side runtime error: Uncaught TypeError: Cannot read properties of undefined",
    );
  });

  it("sanitizes sensitive query params from clientUrl and credentials from message and stack", () => {
    const warnMock = vi.fn();
    const childMock = vi.fn().mockReturnValue({ warn: warnMock });
    const mockLogger = { child: childMock } as unknown as PinoLoggerService;

    const controller = new ClientErrorController(mockLogger);
    controller.reportClientError({
      message: "Failed auth with Bearer secret-token-xyz and email user@example.com",
      errorRef: "c-sec1",
      url: "https://example.test/accept-invite?token=secret123&other=val",
      stack: "Error at login password: supersecretpassword123",
      userAgent: "Mozilla/5.0",
    });

    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientUrl: "https://example.test/accept-invite?token=%5BREDACTED%5D&other=val",
        stack: "Error at login password: [REDACTED]",
      }),
      "Client-side runtime error: Failed auth with Bearer [REDACTED] and email [REDACTED_EMAIL]",
    );
  });
});
