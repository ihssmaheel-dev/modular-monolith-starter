import { Injectable } from "@nestjs/common";
import { eq, and, gt, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { users, type UserRow } from "./schemas/user.schema";
import { User } from "../domain/entities/user.entity";

@Injectable()
export class UsersRepository extends BaseRepository<User, UserRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
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
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
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
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
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
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
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
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }
}
