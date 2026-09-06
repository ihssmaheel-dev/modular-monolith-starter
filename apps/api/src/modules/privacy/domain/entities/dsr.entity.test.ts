import { describe, it, expect } from "vitest";
import { DsrRequest } from "./dsr.entity";

describe("DsrRequest", () => {
  describe("request", () => {
    it("should create an export request in REQUESTED status", () => {
      const request = DsrRequest.request({ type: "EXPORT", subjectUserId: "user-1" });

      expect(request.type).toBe("EXPORT");
      expect(request.status).toBe("REQUESTED");
      expect(request.subjectUserId).toBe("user-1");
      expect(request.id.length).toBeGreaterThan(0);
    });
  });

  describe("isExpired", () => {
    it("should detect a past expiry", () => {
      const request = DsrRequest.request({
        type: "EXPORT",
        subjectUserId: "user-1",
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(request.isExpired()).toBe(true);
    });

    it("should not expire without an expiry date", () => {
      const request = DsrRequest.request({ type: "EXPORT", subjectUserId: "user-1" });

      expect(request.isExpired()).toBe(false);
    });
  });

  describe("transitions", () => {
    it("should mark ready with payload and expiry", () => {
      const request = DsrRequest.request({ type: "EXPORT", subjectUserId: "user-1" });
      request.markReady({ exportedAt: "now" }, new Date(Date.now() + 1000));

      expect(request.status).toBe("READY");
      expect(request.payload).toEqual({ exportedAt: "now" });
    });

    it("should scrub payload on fulfill and expire", () => {
      const request = DsrRequest.request({ type: "EXPORT", subjectUserId: "user-1" });
      request.markReady({ exportedAt: "now" }, new Date(Date.now() + 1000));
      request.markFulfilled();

      expect(request.status).toBe("FULFILLED");
      expect(request.payload).toBeNull();
    });
  });
});
