import {
  generateSecureToken,
  hashSha256Token,
} from "../../../../infrastructure/security/token.utils";

export { generateSecureToken, hashSha256Token };

/**
 * Hash password reset or verification token via SHA-256.
 * Alias for shared hashSha256Token utility.
 */
export const hashPasswordResetToken = hashSha256Token;
