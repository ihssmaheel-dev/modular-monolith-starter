import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  migrateToMultiTenant,
  type MigrationResult,
} from "../../../../../../../scripts/migrate-to-multi-tenant";

interface UserFixture {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

interface OrgFixture {
  id: string;
  name: string;
  slug: string;
  createdBy?: string;
}

interface MembershipFixture {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: "owner" | "admin" | "member";
}

describe("migrateToMultiTenant", () => {
  let mockDb: Parameters<typeof migrateToMultiTenant>[0];
  let insertedOrg: OrgFixture | null = null;
  let insertedMemberships: MembershipFixture[] = [];
  let existingOrgs: OrgFixture[] = [];
  let existingUsers: UserFixture[] = [];
  let existingMemberships: MembershipFixture[] = [];

  beforeEach(() => {
    insertedOrg = null;
    insertedMemberships = [];
    existingOrgs = [];
    existingUsers = [
      { id: "usr-admin", email: "admin@example.com", name: "Admin User", role: "admin" },
      { id: "usr-member", email: "user@example.com", name: "Standard User", role: "member" },
    ];
    existingMemberships = [];

    const createQueryChain = <T>(getData: () => T) => {
      const promise = Promise.resolve().then(() => getData());
      const chain = {
        then: (onfulfilled?: (v: T) => unknown, onrejected?: (e: unknown) => unknown) =>
          promise.then(onfulfilled, onrejected),
        catch: (onrejected?: (e: unknown) => unknown) => promise.catch(onrejected),
        finally: (onfinally?: () => void) => promise.finally(onfinally),
        limit: vi.fn(() => createQueryChain(getData)),
        where: vi.fn(() => createQueryChain(getData)),
      };
      return chain;
    };

    const mockTx = {
      select: vi.fn(() => ({
        from: vi.fn((table: Record<string, unknown>) => {
          if (table.slug) return createQueryChain(() => existingOrgs);
          if (table.userEmail) return createQueryChain(() => existingMemberships);
          return createQueryChain(() => existingUsers);
        }),
      })),
      insert: vi.fn((table: Record<string, unknown>) => ({
        values: vi.fn((vals: unknown) => {
          if (table.slug) insertedOrg = vals as OrgFixture;
          else if (table.userEmail) insertedMemberships.push(vals as MembershipFixture);
          const p = Promise.resolve();
          return {
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) =>
              p.then(onfulfilled, onrejected),
            catch: (onrejected?: (e: unknown) => unknown) => p.catch(onrejected),
          };
        }),
      })),
      update: vi.fn((table: Record<string, unknown>) => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              if (table.content) return Promise.resolve([{ id: "note-1" }, { id: "note-2" }]);
              if (table.bucket) return Promise.resolve([{ id: "file-1" }]);
              if (table.collectionName)
                return Promise.resolve([{ id: "audit-1" }, { id: "audit-2" }, { id: "audit-3" }]);
              if (table.topic) return Promise.resolve([{ id: "outbox-1" }]);
              return Promise.resolve([]);
            }),
          })),
        })),
      })),
    };

    mockDb = {
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    } as unknown as Parameters<typeof migrateToMultiTenant>[0];
  });

  it("creates default organization and backfills users and records", async () => {
    const result: MigrationResult = await migrateToMultiTenant(mockDb, {
      organizationName: "Acme Corp",
      organizationSlug: "acme",
    });

    expect(result.organizationName).toBe("Acme Corp");
    expect(result.organizationSlug).toBe("acme");
    expect(result.membershipsCreated).toBe(2);
    expect(result.notesBackfilled).toBe(2);
    expect(result.filesBackfilled).toBe(1);
    expect(result.auditLogsBackfilled).toBe(3);
    expect(result.outboxEventsBackfilled).toBe(1);
    expect(result.isDryRun).toBe(false);

    expect(insertedOrg).toBeDefined();
    expect(insertedOrg?.name).toBe("Acme Corp");
    expect(insertedOrg?.slug).toBe("acme");
    expect(insertedMemberships).toHaveLength(2);
    expect(insertedMemberships[0]?.role).toBe("owner");
    expect(insertedMemberships[1]?.role).toBe("member");
  });

  it("reuses existing organization if slug already exists", async () => {
    existingOrgs = [{ id: "org-existing-123", name: "Existing Org", slug: "default" }];

    const result = await migrateToMultiTenant(mockDb, {
      organizationSlug: "default",
    });

    expect(result.organizationId).toBe("org-existing-123");
    expect(insertedOrg).toBeNull();
  });

  it("handles dry-run by rolling back transaction without committing", async () => {
    const result = await migrateToMultiTenant(mockDb, {
      dryRun: true,
    });

    expect(result.isDryRun).toBe(true);
  });
});
