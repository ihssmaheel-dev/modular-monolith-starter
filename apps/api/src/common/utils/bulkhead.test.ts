import { describe, expect, it } from "vitest";
import { ok } from "neverthrow";

import { Bulkhead } from "./bulkhead";

describe("Bulkhead", () => {
  it("rejects work above the concurrency limit", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1 }, "BUSY");
    let release: (() => void) | undefined;
    const pending = bulkhead.execute(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return ok("completed");
    });

    const rejected = await bulkhead.execute(async () => ok("unexpected"));
    release?.();

    expect(rejected).toMatchObject({ error: "BUSY" });
    await expect(pending).resolves.toMatchObject({ value: "completed" });
    expect(bulkhead.getActiveCount()).toBe(0);
  });

  it("isolates concurrency limits per partition key", async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 1 }, "BUSY");
    let release: (() => void) | undefined;
    const pending = bulkhead.execute(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return ok("tenant-a");
    }, "tenant-a");

    const other = await bulkhead.execute(async () => ok("tenant-b"), "tenant-b");
    const same = await bulkhead.execute(async () => ok("unexpected"), "tenant-a");
    release?.();

    expect(other).toMatchObject({ value: "tenant-b" });
    expect(same).toMatchObject({ error: "BUSY" });
    await expect(pending).resolves.toMatchObject({ value: "tenant-a" });
    expect(bulkhead.getActiveCount()).toBe(0);
    expect(bulkhead.getActiveCount("tenant-a")).toBe(0);
  });
});
