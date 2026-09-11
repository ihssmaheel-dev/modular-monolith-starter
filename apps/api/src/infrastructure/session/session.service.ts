import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PinoLoggerService } from "../logger/logger.service";
import { SessionData, CreateSessionInput, TOKEN_REVOCATION_TTL_SECONDS } from "./session.types";

/** Session records live as long as the refresh tokens issued against them. */
function sessionTtlSeconds(): number {
  return parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
}
import { sessionKey, tokenRevocationKey, generateSessionId, isRevoked } from "./session.utils";
import { parseDurationToSeconds } from "../../common/utils/duration.utils";
import { env } from "../../config/env";

export type RefreshRotation = "rotated" | "reused" | "unavailable";

const REFRESH_FAMILY_PREFIX = "auth:refresh:family:";
const REFRESH_USED_PREFIX = "auth:refresh:used:";

const ROTATE_REFRESH_SCRIPT = `
  if redis.call('EXISTS', KEYS[2]) == 1 then return 'reused' end
  local current = redis.call('GET', KEYS[1])
  if current and current ~= ARGV[1] then return 'reused' end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
  return 'rotated'
`;

@Injectable()
export class SessionService {
  private logger: PinoLoggerService;

  constructor(
    private readonly redis: RedisService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "SessionService" });
  }

  async create(input: CreateSessionInput): Promise<SessionData> {
    const client = this.redis.getClient();

    const sessionId = generateSessionId();
    const now = Date.now();

    const session: SessionData = {
      id: sessionId,
      userId: input.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      deviceName: input.deviceName,
      createdAt: now,
      lastAccessedAt: now,
    };

    if (client) {
      const key = sessionKey(sessionId);
      await client.setex(key, sessionTtlSeconds(), JSON.stringify(session));
      await client.sadd(`user:${input.userId}:sessions`, sessionId);
      this.logger.info({ sessionId, userId: input.userId }, "Session created");
    } else {
      this.logger.warn(
        { userId: input.userId },
        "Session generated but not persisted (Redis offline)",
      );
    }

    return session;
  }

  /**
   * Atomically rotates one session's refresh chain. Returns "rotated" when
   * the presented token was the family's current head, "reused" when it was
   * already consumed or belongs to a superseded chain (possible theft), and
   * "unavailable" when Redis cannot be reached (fail closed).
   */
  async rotateSessionRefresh(
    userId: string,
    sessionId: string,
    presentedJti: string,
    newJti: string,
  ): Promise<RefreshRotation> {
    const client = this.redis.getClient();
    if (!client) return "unavailable";
    const ttl = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
    const result = (await client.eval(
      ROTATE_REFRESH_SCRIPT,
      2,
      `${REFRESH_FAMILY_PREFIX}${userId}:${sessionId}`,
      `${REFRESH_USED_PREFIX}${userId}:${sessionId}:${presentedJti}`,
      presentedJti,
      newJti,
      ttl.toString(),
    )) as string | null;
    if (result === "rotated" || result === "reused") return result;
    this.logger.error({ userId, sessionId }, "Unexpected refresh rotation outcome");
    return "unavailable";
  }

  /**
   * Loads the session a refresh token belongs to. Returns null when the
   * session is missing or revoked — callers treat that as an invalid token.
   */
  async getRefreshSession(sessionId: string): Promise<SessionData | null> {
    const client = this.redis.getClient();
    if (!client) return null;
    if (await isRevoked(this.redis, sessionId)) return null;
    return this.getById(sessionId);
  }

  async getById(sessionId: string): Promise<SessionData | null> {
    const client = this.redis.getClient();
    if (!client) return null;
    const raw = await client.get(sessionKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  }

  async validate(sessionId: string, ip: string): Promise<SessionData | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    if (await isRevoked(this.redis, sessionId)) {
      return null;
    }

    const session = await this.getById(sessionId);
    if (!session) return null;

    if (session.ip !== ip) {
      this.logger.warn({ sessionId, expectedIp: session.ip, actualIp: ip }, "IP mismatch");
      return null;
    }

    session.lastAccessedAt = Date.now();
    await client.setex(sessionKey(sessionId), sessionTtlSeconds(), JSON.stringify(session));

    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const session = await this.getById(sessionId);
    if (!session) return;

    await client.del(sessionKey(sessionId));
    await client.srem(`user:${session.userId}:sessions`, sessionId);
    await client.setex(tokenRevocationKey(sessionId), TOKEN_REVOCATION_TTL_SECONDS, "1");

    this.logger.info({ sessionId, userId: session.userId }, "Session revoked");
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const sessionIds = await client.smembers(`user:${userId}:sessions`);

    if (sessionIds.length > 0) {
      const pipeline = client.pipeline();
      for (const sid of sessionIds) {
        pipeline.del(sessionKey(sid));
        pipeline.setex(tokenRevocationKey(sid), TOKEN_REVOCATION_TTL_SECONDS, "1");
      }
      await pipeline.exec();
    }

    await client.del(`user:${userId}:sessions`);
    this.logger.info({ userId, count: sessionIds.length }, "All sessions revoked for user");
  }

  async getActiveSessions(userId: string): Promise<SessionData[]> {
    const client = this.redis.getClient();
    if (!client) return [];

    const sessionIds = await client.smembers(`user:${userId}:sessions`);
    if (sessionIds.length === 0) return [];

    const keys = sessionIds.map((sid) => sessionKey(sid));
    const rawSessions = await client.mget(keys);

    return rawSessions
      .filter((raw): raw is string => raw !== null)
      .map((raw) => JSON.parse(raw) as SessionData);
  }
}
