import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { RealtimeService } from "../realtime.service";
import { PinoLoggerService } from "../../logger/logger.service";
import { RedisService } from "../../redis/redis.service";

const AUTH_REVOCATION_CHANNEL = "auth:revocations";

interface RevocationMessage {
  type?: "user" | "tenant_user" | "tenant";
  userId?: string;
  tenantId?: string;
  origin: string;
}

@Injectable()
export class RealtimeAuthListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger: PinoLoggerService;
  private readonly origin = randomUUID();
  private subscriber: Redis | null = null;

  constructor(
    private readonly realtime: RealtimeService,
    logger: PinoLoggerService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger = logger.child({ module: "RealtimeAuthListener" });
  }

  async onModuleInit(): Promise<void> {
    const client = this.redis?.getClient();
    if (!client) return;
    try {
      this.subscriber = client.duplicate();
      await this.subscriber.subscribe(AUTH_REVOCATION_CHANNEL);
      this.subscriber.on("message", (_channel, message) => this.handleRemote(message));
    } catch (error) {
      this.logger.error({ error }, "Realtime auth revocation subscription failed");
      this.subscriber = null;
    }
  }

  @OnEvent("user.auth-version.incremented")
  handleAuthVersionIncremented(payload: { userId: string }): void {
    if (payload?.userId) {
      this.revoke(payload.userId, "auth version increment");
    }
  }

  @OnEvent("user.password.reset")
  handlePasswordReset(payload: { userId: string }): void {
    if (payload?.userId) {
      this.revoke(payload.userId, "password reset");
    }
  }

  @OnEvent("auth.session.revoked")
  handleSessionRevoked(payload: { userId: string }): void {
    if (payload?.userId) {
      this.revoke(payload.userId, "session revocation");
    }
  }

  @OnEvent("tenant.member.removed")
  handleMemberRemoved(payload: { tenantId?: string; userId?: string }): void {
    if (payload?.tenantId && payload?.userId) {
      this.revokeTenantUser(payload.tenantId, payload.userId, "membership removed");
    }
  }

  @OnEvent("membership.removed")
  handleMembershipRemoved(payload: { tenantId?: string; userId?: string }): void {
    if (payload?.tenantId && payload?.userId) {
      this.revokeTenantUser(payload.tenantId, payload.userId, "membership removed");
    }
  }

  @OnEvent("organization.purged")
  handleOrganizationPurged(payload: { tenantId?: string; organizationId?: string }): void {
    const tid = payload?.tenantId ?? payload?.organizationId;
    if (tid) {
      this.revokeTenant(tid, "organization purged");
    }
  }

  private revoke(userId: string, reason: string): void {
    const closed = this.realtime.disconnectUser(userId);
    this.logger.info({ userId, closed }, `Closed realtime sessions on ${reason}`);
    const publisher = this.redis?.getClient();
    if (publisher) {
      void publisher
        .publish(AUTH_REVOCATION_CHANNEL, JSON.stringify({ userId, origin: this.origin }))
        .catch((error: unknown) =>
          this.logger.error({ error, userId }, "Auth revocation publish failed"),
        );
    }
  }

  private revokeTenantUser(tenantId: string, userId: string, reason: string): void {
    const closed = this.realtime.disconnectTenantUser(tenantId, userId);
    this.logger.info({ tenantId, userId, closed }, `Closed realtime sessions on ${reason}`);
    const publisher = this.redis?.getClient();
    if (publisher) {
      void publisher
        .publish(
          AUTH_REVOCATION_CHANNEL,
          JSON.stringify({ type: "tenant_user", tenantId, userId, origin: this.origin }),
        )
        .catch((error: unknown) =>
          this.logger.error({ error, tenantId, userId }, "Tenant user revocation publish failed"),
        );
    }
  }

  private revokeTenant(tenantId: string, reason: string): void {
    const closed = this.realtime.disconnectTenant(tenantId);
    this.logger.info({ tenantId, closed }, `Closed realtime sessions on ${reason}`);
    const publisher = this.redis?.getClient();
    if (publisher) {
      void publisher
        .publish(
          AUTH_REVOCATION_CHANNEL,
          JSON.stringify({ type: "tenant", tenantId, origin: this.origin }),
        )
        .catch((error: unknown) =>
          this.logger.error({ error, tenantId }, "Tenant revocation publish failed"),
        );
    }
  }

  private handleRemote(message: string): void {
    try {
      const payload = JSON.parse(message) as Partial<RevocationMessage>;
      if (payload.origin === this.origin) return;
      if (payload.type === "tenant_user" && payload.tenantId && payload.userId) {
        const closed = this.realtime.disconnectTenantUser(payload.tenantId, payload.userId);
        this.logger.info(
          { tenantId: payload.tenantId, userId: payload.userId, closed },
          "Closed realtime sessions from remote tenant user revocation",
        );
        return;
      }
      if (payload.type === "tenant" && payload.tenantId) {
        const closed = this.realtime.disconnectTenant(payload.tenantId);
        this.logger.info(
          { tenantId: payload.tenantId, closed },
          "Closed realtime sessions from remote tenant revocation",
        );
        return;
      }
      if (typeof payload.userId === "string") {
        const closed = this.realtime.disconnectUser(payload.userId);
        this.logger.info(
          { userId: payload.userId, closed },
          "Closed realtime sessions from remote auth revocation",
        );
      }
    } catch (error) {
      this.logger.warn({ error }, "Ignored malformed auth revocation message");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) await this.subscriber.quit();
  }
}
