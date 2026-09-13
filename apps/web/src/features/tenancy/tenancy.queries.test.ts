import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { tenancyStatusQuery, organizationsListQuery } from "./tenancy.queries";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  tenancy: {
    status: vi.fn(),
    listOrganizations: vi.fn(),
  },
};

describe("tenancy queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("returns tenant status on 200", async () => {
    const body = { mode: "multi" as const, header: "x-tenant-id" as const };
    client.tenancy.status.mockResolvedValue({ status: 200, body });

    await expect(tenancyStatusQuery().queryFn!({} as never)).resolves.toBe(body);
    expect(client.tenancy.status).toHaveBeenCalled();
  });

  it("throws networkError when status query fails", async () => {
    client.tenancy.status.mockResolvedValue({ status: 500, body: null });

    await expect(tenancyStatusQuery().queryFn!({} as never)).rejects.toThrow("errors.networkError");
  });

  it("returns organization list on 200", async () => {
    const body = { items: [], total: 0, page: 1, limit: 50, totalPages: 0 };
    client.tenancy.listOrganizations.mockResolvedValue({ status: 200, body });

    await expect(organizationsListQuery(1, 50).queryFn!({} as never)).resolves.toBe(body);
    expect(client.tenancy.listOrganizations).toHaveBeenCalledWith({
      query: { page: 1, limit: 50 },
    });
  });

  it("throws networkError when listOrganizations query fails", async () => {
    client.tenancy.listOrganizations.mockResolvedValue({ status: 500, body: null });

    await expect(organizationsListQuery(1, 50).queryFn!({} as never)).rejects.toThrow(
      "errors.networkError",
    );
  });
});
