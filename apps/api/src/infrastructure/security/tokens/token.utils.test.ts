import { describe, expect, it } from "vitest";
import { generateSecureToken, hashSha256Token } from "./token.utils";

describe("token.utils", () => {
  it("generates a random hex token with default length", () => {
    const token = generateSecureToken();
    expect(typeof token).toBe("string");
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it("generates a token with custom length", () => {
    const token = generateSecureToken(16);
    expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it("produces deterministic sha256 hash for identical input", () => {
    const input = "sample-token-string";
    const hash1 = hashSha256Token(input);
    const hash2 = hashSha256Token(input);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces distinct hashes for different inputs", () => {
    const hash1 = hashSha256Token("token-a");
    const hash2 = hashSha256Token("token-b");
    expect(hash1).not.toBe(hash2);
  });
});
