import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PinoLoggerService } from "../logger/logger.service";
import {
  SessionData,
  CreateSessionInput,
  SESSION_PREFIX,
  TOKEN_REVOCATION_TTL_SECONDS,
} from "./session.types";
import { err, ok, type Result } from "neverthrow";
import { sessionKey, tokenRevocationKey, generateSessionId, isRevoked } from "./session.utils";
import { parseDurationToSeconds } from "../../common/utils/duration.utils";
import { env } from "../../config/env";

/** Sessions have an absolute lifetime equal to the configured refresh-token lifetime. */
function sessionTtlSeconds(): number {
  return parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
}

export type RefreshRotation = "rotated" | "reused" | "unavailable";

const REFRESH_FAMILY_PREFIX = "auth:refresh:family:";
const REFRESH_USED_PREFIX = "auth:refresh:used:";
const USER_SESSION_PREFIX = "user:";
const USER_SESSION_SUFFIX = ":sessions";
const MAX_ACTIVE_SESSIONS = 20;

const CREATE_SESSION_SCRIPT = `
  local keyType = redis.call('TYPE', KEYS[2])['ok']
  if keyType ~= 'zset' and keyType ~= 'none' then
    redis.call('DEL', KEYS[2])
  end
  redis.call('SETEX', KEYS[1], ARGV[1], ARGV[2])
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
  redis.call('EXPIRE', KEYS[2], ARGV[1])
  local overflow = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[5])
  if overflow <= 0 then return 0 end
  local expired = redis.call('ZRANGE', KEYS[2], 0, overflow - 1)
  for _, sid in ipairs(expired) do
    redis.call('DEL', ARGV[6] .. sid)
    redis.call('ZREM', KEYS[2], sid)
  end
  return #expired
`;

const ROTATE_REFRESH_SCRIPT = `
  local ttl = redis.call('TTL', KEYS[3])
  if ttl <= 0 then return 'unavailable' end
  if redis.call('EXISTS', KEYS[2]) == 1 then return 'reused' end
  local current = redis.call('GET', KEYS[1])
  if current and current ~= ARGV[1] then return 'reused' end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ttl)
  redis.call('SET', KEYS[2], '1', 'EX', ttl)
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

  async create(
    input: CreateSessionInput,
  ): Promise<Result<SessionData, { type: "SESSION_UNAVAILABLE" }>> {
    const client = this.redis.getClient();
    if (!client) return err({ type: "SESSION_UNAVAILABLE" });

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
      expiresAt: now + sessionTtlSeconds() * 1000,
    };

    try {
      const key = sessionKey(sessionId);
      await client.eval(
        CREATE_SESSION_SCRIPT,
        2,
        key,
        userSessionsKey(input.userId),
        sessionTtlSeconds().toString(),
        JSON.stringify(session),
        now.toString(),
        sessionId,
        MAX_ACTIVE_SESSIONS.toString(),
        SESSION_PREFIX,
      );
      this.logger.info({ sessionId, userId: input.userId }, "Session created");
      return ok(session);
    } catch (error) {
      this.logger.error({ userId: input.userId, error }, "Session persistence failed");
      return err({ type: "SESSION_UNAVAILABLE" });
    }
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
    const result = (await client.eval(
      ROTATE_REFRESH_SCRIPT,
      3,
      `${REFRESH_FAMILY_PREFIX}${userId}:${sessionId}`,
      `${REFRESH_USED_PREFIX}${userId}:${sessionId}:${presentedJti}`,
      sessionKey(sessionId),
      presentedJti,
      newJti,
    )) as string | null;
    if (result === "rotated" || result === "reused" || result === "unavailable") return result;
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
    await client.set(sessionKey(sessionId), JSON.stringify(session), "KEEPTTL");

    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const session = await this.getById(sessionId);
    if (!session) return;

    await client.del(sessionKey(sessionId));
    try {
      await client.zrem(userSessionsKey(session.userId), sessionId);
    } catch {
      // Best-effort index cleanup; resilient against legacy index key shapes
    }
    await client.setex(tokenRevocationKey(sessionId), TOKEN_REVOCATION_TTL_SECONDS, "1");

    this.logger.info({ sessionId, userId: session.userId }, "Session revoked");
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const indexKey = userSessionsKey(userId);
    let sessionIds: string[] = [];
    try {
      sessionIds = await client.zrange(indexKey, "0", "-1");
    } catch (error) {
      this.logger.warn(
        { userId, error },
        "Failed to read user sessions index during revokeAllForUser",
      );
      await client.del(indexKey).catch(() => {});
      return;
    }

    if (sessionIds.length > 0) {
      const pipeline = client.pipeline();
      for (const sid of sessionIds) {
        pipeline.del(sessionKey(sid));
        pipeline.setex(tokenRevocationKey(sid), TOKEN_REVOCATION_TTL_SECONDS, "1");
      }
      await pipeline.exec();
    }

    await client.del(indexKey);
    this.logger.info({ userId, count: sessionIds.length }, "All sessions revoked for user");
  }

  async getActiveSessions(userId: string): Promise<SessionData[]> {
    const client = this.redis.getClient();
    if (!client) return [];

    const indexKey = userSessionsKey(userId);
    let sessionIds: string[];
    try {
      sessionIds = await client.zrange(indexKey, "0", String(MAX_ACTIVE_SESSIONS - 1));
    } catch (error) {
      this.logger.warn({ userId, error }, "Corrupt user sessions index detected; clearing index");
      await client.del(indexKey).catch(() => {});
      return [];
    }
    if (sessionIds.length === 0) return [];

    const keys = sessionIds.map((sid) => sessionKey(sid));
    const rawSessions = await client.mget(keys);

    const missing = sessionIds.filter((_, index) => rawSessions[index] === null);
    if (missing.length > 0) {
      try {
        await client.zrem(indexKey, ...missing);
      } catch {
        // Best-effort index cleanup
      }
    }
    return rawSessions.flatMap((raw) => {
      if (!raw) return [];
      try {
        return [JSON.parse(raw) as SessionData];
      } catch {
        return [];
      }
    });
  }
}

function userSessionsKey(userId: string): string {
  return `${USER_SESSION_PREFIX}${userId}${USER_SESSION_SUFFIX}`;
}
