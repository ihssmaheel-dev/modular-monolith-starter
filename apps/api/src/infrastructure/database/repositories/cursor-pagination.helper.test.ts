import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  decodeCursor,
  encodeCursor,
  buildCursorClause,
  buildCursorOrder,
} from "./cursor-pagination.helper";

describe("cursor-pagination.helper", () => {
  describe("decodeCursor", () => {
    it("returns null for empty or missing cursor", () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor("")).toBeNull();
    });

    it("decodes valid base64url JSON composite cursor", () => {
      const encoded = Buffer.from(JSON.stringify({ v: "alpha", id: "item-123" })).toString(
        "base64url",
      );
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({ val: "alpha", id: "item-123" });
    });

    it("parses ISO date strings in cursor value into Date objects", () => {
      const iso = "2026-01-01T12:00:00.000Z";
      const encoded = Buffer.from(JSON.stringify({ v: iso, id: "item-456" })).toString("base64url");
      const decoded = decodeCursor(encoded);
      expect(decoded?.val).toBeInstanceOf(Date);
      expect((decoded?.val as Date).toISOString()).toBe(iso);
      expect(decoded?.id).toBe("item-456");
    });

    it("falls back to plain string when cursor is not base64url JSON", () => {
      const decoded = decodeCursor("plain-uuid-123");
      expect(decoded).toEqual({ val: "plain-uuid-123", id: undefined });
    });
  });

  describe("encodeCursor", () => {
    it("returns plain id when cursorField is id", () => {
      const encoded = encodeCursor("id", { id: "record-99", name: "test" });
      expect(encoded).toBe("record-99");
    });

    it("returns base64url JSON composite cursor when cursorField is not id", () => {
      const date = new Date("2026-03-01T00:00:00.000Z");
      const encoded = encodeCursor("createdAt", { id: "record-99", createdAt: date });
      expect(encoded).toBeTruthy();
      const decoded = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
      expect(decoded).toEqual({ v: date.toISOString(), id: "record-99" });
    });
  });

  describe("buildCursorClause & buildCursorOrder", () => {
    const fakeCol = sql`created_at`;
    const fakeIdCol = sql`id`;

    it("builds composite tie-breaker clause for desc direction", () => {
      const clause = buildCursorClause(
        fakeCol,
        fakeIdCol,
        { val: "2026-01-01", id: "rec-1" },
        "createdAt",
        "desc",
      );
      expect(clause).toBeDefined();
    });

    it("builds composite tie-breaker clause for asc direction", () => {
      const clause = buildCursorClause(
        fakeCol,
        fakeIdCol,
        { val: "2026-01-01", id: "rec-1" },
        "createdAt",
        "asc",
      );
      expect(clause).toBeDefined();
    });

    it("builds primary-only clause when cursorField is id", () => {
      const clause = buildCursorClause(fakeIdCol, fakeIdCol, { val: "rec-1" }, "id", "desc");
      expect(clause).toBeDefined();
    });

    it("builds ordering with secondary id tie breaker", () => {
      const ordersDesc = buildCursorOrder(fakeCol, fakeIdCol, "createdAt", "desc");
      expect(ordersDesc).toHaveLength(2);

      const ordersAsc = buildCursorOrder(fakeCol, fakeIdCol, "createdAt", "asc");
      expect(ordersAsc).toHaveLength(2);
    });

    it("builds single order clause when cursorField is id", () => {
      const orders = buildCursorOrder(fakeIdCol, fakeIdCol, "id", "desc");
      expect(orders).toHaveLength(1);
    });
  });
});
