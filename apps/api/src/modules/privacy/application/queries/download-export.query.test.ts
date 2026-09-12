import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { DownloadExportQuery } from "./download-export.query";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const OWNER = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;
const ADMIN = { sub: "admin-1", email: "a@example.com", role: "admin" } as AuthenticatedUser;

function payload() {
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: "user-1",
      email: "u@example.com",
      name: "U",
      role: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    memberships: [],
    invitations: [],
    notes: [],
    files: [],
    notificationPreferences: [],
    truncated: false,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return DsrRequest.fromPersistence({
    id: "dsr-1",
    type: "EXPORT",
    status: "READY",
    subjectUserId: "user-1",
    payload: payload(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe("DownloadExportQuery", () => {
  let query: DownloadExportQuery;
  let requests: PrivacyRepository;

  beforeEach(() => {
    requests = {
      findById: vi.fn(),
      updateById: vi.fn(),
    } as unknown as PrivacyRepository;
    query = new DownloadExportQuery(requests);
  });

  it("should return the snapshot to its owner", async () => {
    vi.mocked(requests.findById).mockResolvedValue(ok(request()));

    const result = await query.execute("dsr-1", OWNER);

    expect(result.isOk()).toBe(true);
  });

  it("should refuse admins who do not own the export", async () => {
    vi.mocked(requests.findById).mockResolvedValue(ok(request()));

    const result = await query.execute("dsr-1", ADMIN);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("DSR_FORBIDDEN");
  });

  it("should expire and refuse stale exports", async () => {
    vi.mocked(requests.findById).mockResolvedValue(
      ok(request({ expiresAt: new Date("2026-01-01T00:00:00Z") })),
    );
    vi.mocked(requests.updateById).mockResolvedValue(ok(request()));

    const result = await query.execute("dsr-1", OWNER);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("DSR_EXPIRED");
    expect(requests.updateById).toHaveBeenCalledWith("dsr-1", { status: "EXPIRED" });
  });
});
