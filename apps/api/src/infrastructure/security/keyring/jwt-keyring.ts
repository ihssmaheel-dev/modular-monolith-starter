import jwt, { type JwtPayload, type VerifyOptions } from "jsonwebtoken";
import { env } from "../../../config/env";

export type JwtTokenKind = "access" | "refresh";

export interface JwtKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
  legacySecret: string;
}

export function getJwtKeyring(kind: JwtTokenKind): JwtKeyring {
  const refresh = kind === "refresh";
  const activeKeyId = refresh ? env.JWT_REFRESH_ACTIVE_KEY_ID : env.JWT_ACTIVE_KEY_ID;
  const legacySecret = refresh ? env.JWT_REFRESH_SECRET : env.JWT_SECRET;
  const configuredKeys = refresh ? env.JWT_REFRESH_SIGNING_KEYS : env.JWT_SIGNING_KEYS;
  return {
    activeKeyId,
    keys: configuredKeys ?? { [activeKeyId]: legacySecret },
    legacySecret,
  };
}

export function verifyJwtWithKeyring(
  token: string,
  keyring: JwtKeyring,
  options: VerifyOptions,
): JwtPayload | null {
  for (const secret of verificationSecrets(token, keyring)) {
    try {
      const decoded = jwt.verify(token, secret, { ...options, algorithms: ["HS256"] });
      if (typeof decoded !== "string") return decoded;
    } catch {
      // Try the next retained key. Invalid tokens remain an expected auth failure.
    }
  }
  return null;
}

function verificationSecrets(token: string, keyring: JwtKeyring): string[] {
  const keyId = readKeyId(token);
  if (keyId) {
    const secret = keyring.keys[keyId];
    return secret ? [secret] : [];
  }
  return [keyring.legacySecret];
}

function readKeyId(token: string): string | undefined {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") return undefined;
  return typeof decoded.header.kid === "string" ? decoded.header.kid : undefined;
}
