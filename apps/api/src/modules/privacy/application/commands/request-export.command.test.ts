import { describe, it, expect, vi, beforeEach } from "vitest";
import { err, ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RequestExportCommand } from "./request-export.command";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { ListInvitationsByEmailQuery } from "../../../tenancy/application/queries/list-invitations-by-email.query";
import { GetNotesQuery } from "../../../notes/application/queries/get-notes.query";
import { ListFilesByUploaderQuery } from "../../../files/application/queries/list-files-by-uploader.query";
import { TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { User } from "../../../users/domain/entities/user.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "a@example.com", role: "user" } as AuthenticatedUser;

describe("RequestExportCommand", () => {
  let command: RequestExportCommand;
  let requests: PrivacyRepository;
  let outbox: OutboxService;
  let events: EventEmitter2;

  const user = User.fromPersistence({
    id: "user-1",
    email: "a@example.com",
    name: "A",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  });

  beforeEach(() => {
    requests = { create: vi.fn() } as unknown as PrivacyRepository;
    const getUserById = {
      execute: vi.fn().mockResolvedValue(ok(user)),
    } as unknown as GetUserByIdQuery;
    const listOrganizations = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 })),
    } as unknown as ListOrganizationsQuery;
    const listInvitationsByEmail = {
      execute: vi.fn().mockResolvedValue(ok([])),
    } as unknown as ListInvitationsByEmailQuery;
    const getNotes = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 })),
    } as unknown as GetNotesQuery;
    const listFilesByUploader = {
      execute: vi.fn().mockResolvedValue(ok([])),
    } as unknown as ListFilesByUploaderQuery;
    const tenantContext = {} as TenantContextService;
    outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;
    events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;

    command = new RequestExportCommand(
      requests,
      getUserById,
      listOrganizations,
      listInvitationsByEmail,
      getNotes,
      listFilesByUploader,
      tenantContext,
      outbox,
      events,
    );
  });

  it("should assemble a snapshot and dispatch export.ready", async () => {
    vi.mocked(requests.create).mockResolvedValue(ok({ id: "dsr-1" }) as never);

    const result = await command.execute(ACTOR);

    expect(result.isOk()).toBe(true);
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "EXPORT", status: "READY", subjectUserId: "user-1" }),
    );
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith("privacy.export.ready", expect.anything());
  });

  it("should return EXPORT_FAILED when the event cannot dispatch", async () => {
    vi.mocked(requests.create).mockResolvedValue(ok({ id: "dsr-1" }) as never);
    vi.mocked(outbox.dispatchGlobal).mockResolvedValue(err({ type: "OUTBOX_WRITE_FAILED" }));

    const result = await command.execute(ACTOR);

    expect(result.isErr()).toBe(true);
  });
});
