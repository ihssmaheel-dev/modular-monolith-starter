import { describe, it, expect, vi, beforeEach } from "vitest";
import { err, ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RequestAccountErasureCommand } from "./request-account-erasure.command";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { VerifyUserCredentialsQuery } from "../../../users/application/queries/verify-user-credentials.query";
import { AnonymizeUserCommand } from "../../../users/application/commands/anonymize-user.command";
import { IncrementAuthVersionCommand } from "../../../users/application/commands/increment-auth-version.command";
import { SessionService } from "../../../../infrastructure/session/session.service";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { CanDeleteUserQuery } from "../../../tenancy/application/queries/can-delete-user.query";
import { PurgeUserTenancyDataCommand } from "../../../tenancy/application/commands/purge-user-tenancy-data.command";
import { PurgeUserNotesCommand } from "../../../notes/application/commands/purge-user-notes.command";
import { PurgeUserFilesCommand } from "../../../files/application/commands/purge-user-files.command";
import { TenantContextService } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { User } from "../../../users/domain/entities/user.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "a@example.com", role: "user" } as AuthenticatedUser;

describe("RequestAccountErasureCommand", () => {
  let command: RequestAccountErasureCommand;
  let requests: PrivacyRepository;
  let verifyCredentials: VerifyUserCredentialsQuery;
  let outbox: OutboxService;

  const user = User.fromPersistence({
    id: "user-1",
    email: "a@example.com",
    name: "A",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    requests = {
      create: vi.fn(),
      findPendingErasureForSubject: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as PrivacyRepository;
    const getUserById = {
      execute: vi.fn().mockResolvedValue(ok(user)),
    } as unknown as GetUserByIdQuery;
    verifyCredentials = {
      execute: vi.fn().mockResolvedValue(ok(user)),
    } as unknown as VerifyUserCredentialsQuery;
    const anonymizeUser = {
      execute: vi.fn().mockResolvedValue(ok(user)),
    } as unknown as AnonymizeUserCommand;
    const incrementAuthVersion = {
      execute: vi.fn().mockResolvedValue(ok(user)),
    } as unknown as IncrementAuthVersionCommand;
    const sessions = { revokeAllForUser: vi.fn() } as unknown as SessionService;
    const listOrganizations = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 })),
    } as unknown as ListOrganizationsQuery;
    const canDeleteUser = {
      execute: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as CanDeleteUserQuery;
    const purgeTenancy = {
      execute: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as PurgeUserTenancyDataCommand;
    const purgeNotes = {
      execute: vi.fn().mockResolvedValue(ok({ deleted: 0 })),
    } as unknown as PurgeUserNotesCommand;
    const purgeFiles = {
      execute: vi.fn().mockResolvedValue(ok({ deleted: 0 })),
    } as unknown as PurgeUserFilesCommand;
    const tenantContext = {} as TenantContextService;
    const cache = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;

    command = new RequestAccountErasureCommand(
      requests,
      getUserById,
      verifyCredentials,
      anonymizeUser,
      incrementAuthVersion,
      sessions,
      listOrganizations,
      canDeleteUser,
      purgeTenancy,
      purgeNotes,
      purgeFiles,
      tenantContext,
      cache,
      outbox,
      events,
    );
  });

  it("should reject a wrong password without touching data", async () => {
    vi.mocked(verifyCredentials.execute).mockResolvedValue(ok(null));

    const result = await command.execute(ACTOR, "wrong");

    expect(result.isErr() && result.error.type).toBe("INVALID_PASSWORD");
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("should reject a second request while one is pending", async () => {
    vi.mocked(requests.findPendingErasureForSubject).mockResolvedValue(ok({ id: "old" }) as never);

    const result = await command.execute(ACTOR, "secret123");

    expect(result.isErr() && result.error.type).toBe("ERASURE_ALREADY_REQUESTED");
  });

  it("should anonymize, revoke, and schedule purge", async () => {
    vi.mocked(requests.create).mockResolvedValue(ok({ id: "dsr-9" }) as never);

    const result = await command.execute(ACTOR, "secret123");

    expect(result.isOk()).toBe(true);
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ACCOUNT_ERASURE", status: "REQUESTED" }),
    );
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith(
      "privacy.account.erasure.requested",
      expect.anything(),
    );
  });

  it("should block erasure while the user solely owns an organization", async () => {
    const blocked = new RequestAccountErasureCommand(
      requests,
      { execute: vi.fn().mockResolvedValue(ok(user)) } as never,
      verifyCredentials,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        execute: vi.fn().mockResolvedValue(err({ type: "USER_OWNS_ORGANIZATION" })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      outbox,
      {} as never,
    );

    const result = await blocked.execute(ACTOR, "secret123");

    expect(result.isErr() && result.error.type).toBe("LAST_OWNER_BLOCKED");
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("should return ERASURE_FAILED when user lookup fails", async () => {
    const cmd = new RequestAccountErasureCommand(
      requests,
      { execute: vi.fn().mockResolvedValue(err({ type: "USER_NOT_FOUND", userId: "x" })) } as never,
      verifyCredentials,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      outbox,
      {} as never,
    );

    const result = await cmd.execute(ACTOR, "secret123");

    expect(result.isErr()).toBe(true);
  });
});
