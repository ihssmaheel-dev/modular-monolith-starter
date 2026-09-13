export const AUTH_USER_VERIFIER_PORT = Symbol("AUTH_USER_VERIFIER_PORT");

export interface AuthUserVerifierPort {
  verifyUserAuthVersion(userId: string, expectedVersion?: number): Promise<{ valid: boolean }>;
}
