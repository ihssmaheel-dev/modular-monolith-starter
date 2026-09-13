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
});
