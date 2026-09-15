import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { AuthenticatedUser } from "@repo/contracts";
import { RequestExportCommand } from "./request-export.command";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { ListInvitationsByEmailQuery } from "../../../tenancy/application/queries/list-invitations-by-email.query";
import type { DataLifecycleRegistry } from "../../../../infrastructure/lifecycle/data-lifecycle.registry";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { User } from "../../../users/domain/entities/user.entity";
import { DsrRequest } from "../../domain/entities/dsr.entity";

const ACTOR = { sub: "user-1", email: "a@example.com", role: "user" } as AuthenticatedUser;

function request(status: "REQUESTED" | "PROCESSING" = "REQUESTED") {
  return DsrRequest.fromPersistence({
    id: "dsr-1",
    type: "EXPORT",
    status,
    subjectUserId: ACTOR.sub,
    attempts: status === "PROCESSING" ? 1 : 0,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("RequestExportCommand", () => {
  let command: RequestExportCommand;
  let requests: PrivacyRepository;
  let lifecycle: DataLifecycleRegistry;
  let outbox: OutboxService;

  beforeEach(() => {
    requests = {
      create: vi.fn().mockResolvedValue(ok(request())),
      findActiveExportForSubject: vi.fn().mockResolvedValue(null),
      completeExport: vi.fn().mockResolvedValue(ok(request("PROCESSING"))),
    } as unknown as PrivacyRepository;
    const user = User.fromPersistence({
      id: ACTOR.sub,
      email: ACTOR.email,
      name: "A",
      role: "user",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    });
    const getUser = { execute: vi.fn().mockResolvedValue(ok(user)) } as unknown as GetUserByIdQuery;
    const organizations = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 100, totalPages: 1 })),
    } as unknown as ListOrganizationsQuery;
    const invitations = {
      execute: vi.fn().mockResolvedValue(ok([])),
    } as unknown as ListInvitationsByEmailQuery;
    lifecycle = {
      exportSubject: vi.fn().mockResolvedValue(ok({ data: {}, truncated: false })),
    } as unknown as DataLifecycleRegistry;
    outbox = {
      dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    command = new RequestExportCommand(
      requests,
      getUser,
      organizations,
      invitations,
      lifecycle,
      outbox,
      events,
    );
  });

  it("enqueues an export and returns immediately", async () => {
    const result = await command.execute(ACTOR);

    expect(result.isOk()).toBe(true);
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "EXPORT", status: "REQUESTED", subjectUserId: ACTOR.sub }),
    );
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith(
      "privacy.export.requested",
      expect.anything(),
    );
    expect(lifecycle.exportSubject).not.toHaveBeenCalled();
  });

  it("returns the active export instead of enqueueing a duplicate", async () => {
    vi.mocked(requests.findActiveExportForSubject).mockResolvedValue(request());

    const result = await command.execute(ACTOR);

    expect(result.isOk()).toBe(true);
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("processes contributors into a module-keyed snapshot", async () => {
    vi.mocked(lifecycle.exportSubject).mockResolvedValue(
      ok({ data: { notes: { items: [{ id: "n1" }] } }, truncated: false }),
    );

    const result = await command.process(request("PROCESSING"));

    expect(result.isOk()).toBe(true);
    expect(requests.completeExport).toHaveBeenCalledWith(
      "dsr-1",
      expect.objectContaining({ modules: { notes: { items: [{ id: "n1" }] } } }),
      false,
      expect.any(Date),
    );
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith("privacy.export.ready", expect.anything());
  });

  it("fails the enqueue when its durable event cannot be recorded", async () => {
    vi.mocked(outbox.dispatchGlobal).mockResolvedValue(err({ type: "OUTBOX_WRITE_FAILED" }));

    const result = await command.execute(ACTOR);

    expect(result.isErr()).toBe(true);
  });
});
