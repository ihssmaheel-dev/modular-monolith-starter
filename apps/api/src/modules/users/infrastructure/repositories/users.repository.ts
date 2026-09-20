import { Injectable, Optional } from "@nestjs/common";
import { eq, and, gt, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository, type Id } from "../../../../infrastructure/database";
import { users, type UserRow } from "../schemas/user.schema";
import { User } from "../../domain/entities/user.entity";
import { RedisService } from "../../../../infrastructure/redis";

@Injectable()
export class UsersRepository extends BaseRepository<User, UserRow> {
  constructor(
    database: DatabaseService,
    tenantContext: TenantContextService,
    @Optional() private readonly redis?: RedisService,
  ) {
    super(users, database, tenantContext, false);
  }

  protected toDomain(row: UserRow): User {
    return User.fromPersistence({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as "user" | "admin",
      avatarFileId: row.avatarFileId ?? null,
      authVersion: row.authVersion,
      emailVerifiedAt: row.emailVerifiedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async invalidateCache(userId: string): Promise<void> {
    const client = this.redis?.getClient();
    if (!client) return;
    try {
      await client.del(`cache:user:${userId}`);
      await client.del(`user:${userId}`);
    } catch {
      // Fail open
    }
  }

  override async updateById(
    id: Id,
    update: Record<string, unknown>,
    expectedVersion?: Date | number,
  ): Promise<Result<User | null, { type: "CONFLICT" }>> {
    const result = await super.updateById(id, update, expectedVersion);
    if (result.isOk()) {
      await this.invalidateCache(id as string);
    }
    return result;
  }

  override async deleteById(id: Id): Promise<Result<boolean, never>> {
    const result = await super.deleteById(id);
    if (result.isOk()) {
      await this.invalidateCache(id as string);
    }
    return result;
  }

  override async softDeleteById(id: Id): Promise<Result<User | null, never>> {
    const result = await super.softDeleteById(id);
    if (result.isOk()) {
      await this.invalidateCache(id as string);
    }
    return result;
  }

  async findByEmailWithPassword(
    email: string,
  ): Promise<Result<(UserRow & { passwordHash: string }) | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => { from: (t: unknown) => { where: (c: unknown) => Promise<UserRow[]> } };
      }
    )
      .select()
      .from(users)
      .where(eq(users.email, email));
    return ok((rows[0] as UserRow & { passwordHash: string }) ?? null);
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Result<boolean, never>> {
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => Promise<unknown[]> };
        };
      }
    )
      .update(users)
      .set({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(eq(users.id, userId));
    return ok(true);
  }

  async resetPasswordByToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<Result<User | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<UserRow[]> } };
        };
      }
    )
      .update(users)
      .set({
        passwordHash,
        authVersion: sql`auth_version + 1`,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(
        and(
          eq(users.passwordResetTokenHash, tokenHash),
          gt(users.passwordResetExpiresAt, new Date()),
        ),
      )
      .returning();
    const row = rows[0];
    if (row) {
      await this.invalidateCache(row.id);
    }
    return ok(row ? this.toDomain(row) : null);
  }

  async setEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Result<boolean, never>> {
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => Promise<unknown[]> };
        };
      }
    )
      .update(users)
      .set({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(eq(users.id, userId));
    return ok(true);
  }

  async verifyEmailByToken(tokenHash: string): Promise<Result<User | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<UserRow[]> } };
        };
      }
    )
      .update(users)
      .set({
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(
        and(
          eq(users.emailVerificationTokenHash, tokenHash),
          gt(users.emailVerificationExpiresAt, new Date()),
        ),
      )
      .returning();
    const row = rows[0];
    if (row) {
      await this.invalidateCache(row.id);
    }
    return ok(row ? this.toDomain(row) : null);
  }

  async setEmailChangeRequest(
    userId: string,
    pendingEmail: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Result<boolean, never>> {
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => Promise<unknown[]> };
        };
      }
    )
      .update(users)
      .set({
        pendingEmail,
        emailChangeTokenHash: tokenHash,
        emailChangeExpiresAt: expiresAt,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(eq(users.id, userId));
    return ok(true);
  }

  /**
   * Atomically applies a pending email change: the address is proven by
   * token possession, so it is marked verified, sessions are revoked via
   * the version bump, and the one-time token is cleared in the same UPDATE.
   */
  async applyEmailChangeByToken(tokenHash: string): Promise<Result<User | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<UserRow[]> } };
        };
      }
    )
      .update(users)
      .set({
        email: sql`pending_email`,
        emailVerifiedAt: new Date(),
        authVersion: sql`auth_version + 1`,
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeExpiresAt: null,
        updatedAt: new Date(),
      } as unknown as Record<string, unknown>)
      .where(
        and(eq(users.emailChangeTokenHash, tokenHash), gt(users.emailChangeExpiresAt, new Date())),
      )
      .returning();
    const row = rows[0];
    if (row) {
      await this.invalidateCache(row.id);
    }
    return ok(row ? this.toDomain(row) : null);
  }

  async incrementAuthVersion(userId: string): Promise<Result<User | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<UserRow[]> } };
        };
      }
    )
      .update(users)
      .set({ authVersion: sql`auth_version + 1`, updatedAt: new Date() } as unknown as Record<
        string,
        unknown
      >)
      .where(eq(users.id, userId))
      .returning();
    const row = rows[0];
    if (row) {
      await this.invalidateCache(userId);
    }
    return ok(row ? this.toDomain(row) : null);
  }
}
