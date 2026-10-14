import { createHash } from "node:crypto";
import { test as base, expect } from "@playwright/test";

// Keep production rate limits enabled while giving each browser scenario its own
// IP budget. Only the local test API enables TRUST_PROXY for these headers.
export const test = base.extend<{ testClientIdentity: void }>({
  testClientIdentity: [
    async ({ context }, use, testInfo) => {
      const identity = `${testInfo.testId}:${testInfo.repeatEachIndex}:${testInfo.retry}`;
      const digest = createHash("sha256").update(identity).digest();
      const address = Array.from({ length: 6 }, (_, index) =>
        digest.readUInt16BE(index * 2).toString(16),
      ).join(":");
      // Add the proxy header at the network boundary, after browser CORS checks.
      // Browser application code never sends or requires this header.
      await context.route("**/api/v1/**", (route) =>
        route.continue({
          headers: {
            ...route.request().headers(),
            "x-forwarded-for": `2001:db8:${address}`,
          },
        }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
