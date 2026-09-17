import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { verifyJwtWithKeyring, type JwtKeyring } from "./jwt-keyring";

const ISSUER = "test-api";
const AUDIENCE = "test-client";
const LEGACY_SECRET = "l".repeat(32);
const CURRENT_SECRET = "c".repeat(32);

const keyring: JwtKeyring = {
  activeKeyId: "current",
  keys: { old: LEGACY_SECRET, current: CURRENT_SECRET },
  legacySecret: LEGACY_SECRET,
};

describe("jwt-keyring", () => {
  it("verifies a token using its active key id", () => {
    const token = jwt.sign({ sub: "user-1" }, CURRENT_SECRET, {
      algorithm: "HS256",
      issuer: ISSUER,
      audience: AUDIENCE,
      keyid: "current",
    });

    const result = verifyJwtWithKeyring(token, keyring, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(result).toMatchObject({ sub: "user-1" });
  });

  it("continues verifying legacy tokens without a key id", () => {
    const token = jwt.sign({ sub: "legacy-user" }, LEGACY_SECRET, {
      algorithm: "HS256",
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const result = verifyJwtWithKeyring(token, keyring, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(result).toMatchObject({ sub: "legacy-user" });
  });

  it("rejects tokens with an unknown key id", () => {
    const token = jwt.sign({ sub: "user-1" }, CURRENT_SECRET, {
      algorithm: "HS256",
      issuer: ISSUER,
      audience: AUDIENCE,
      keyid: "removed",
    });

    const result = verifyJwtWithKeyring(token, keyring, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(result).toBeNull();
  });
});
