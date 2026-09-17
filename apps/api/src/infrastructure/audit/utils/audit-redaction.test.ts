import { describe, expect, it } from "vitest";
import { redactAuditValue } from "./audit-redaction";

describe("redactAuditValue", () => {
  it("redacts sensitive fields recursively without changing safe evidence", () => {
    const result = redactAuditValue({
      email: "user@example.test",
      nested: { refreshToken: "secret", profile: { name: "User" } },
      credentials: [{ privateKey: "key" }],
    });

    expect(result).toEqual({
      email: "user@example.test",
      nested: { refreshToken: "[REDACTED]", profile: { name: "User" } },
      credentials: "[REDACTED]",
    });
  });
});
