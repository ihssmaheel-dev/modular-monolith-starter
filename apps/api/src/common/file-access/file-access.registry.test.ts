import { describe, expect, it } from "vitest";
import { FileAccessRegistry } from "./file-access.registry";

describe("FileAccessRegistry", () => {
  it("returns the checker registered for a parent type", async () => {
    const registry = new FileAccessRegistry();
    registry.registerParentAccess("note", async () => true);

    expect(await registry.getChecker("note")?.({} as never, {} as never)).toBe(true);
    expect(registry.getChecker("unknown")).toBeUndefined();
  });

  it("rejects duplicate registration loudly", () => {
    const registry = new FileAccessRegistry();
    registry.registerParentAccess("note", async () => true);

    expect(() => registry.registerParentAccess("note", async () => false)).toThrow(
      "Duplicate file access checker",
    );
  });
});
