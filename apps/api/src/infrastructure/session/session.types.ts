export const SESSION_PREFIX = "session:";
export const TOKEN_REVOCATION_PREFIX = "revoked:";
export const TOKEN_REVOCATION_TTL_SECONDS = 604800; // 7 days

export interface SessionData {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  deviceName: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface CreateSessionInput {
  userId: string;
  ip: string;
  userAgent: string;
  deviceName: string;
}
