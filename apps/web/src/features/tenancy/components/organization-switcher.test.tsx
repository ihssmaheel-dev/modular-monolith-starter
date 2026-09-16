import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTenantStore } from "@/stores/tenant.store";
import { OrganizationSwitcher } from "./organization-switcher";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock("@/lib/api", () => ({
  getApiClient: () => ({
    tenancy: {
      status: vi.fn().mockResolvedValue({
        status: 200,
        body: { mode: "multi" },
      }),
      listOrganizations: vi.fn().mockResolvedValue({
        status: 200,
        body: {
          items: [
            {
              id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
              name: "Acme Corp",
              slug: "acme",
              role: "owner",
            },
            {
              id: "650e8400-e29b-41d4-a716-446655440000",
              name: "Beta LLC",
              slug: "beta",
              role: "member",
            },
          ],
          total: 2,
        },
      }),
    },
  }),
}));

describe("OrganizationSwitcher", () => {
  beforeEach(() => {
    queryClient.clear();
    useTenantStore.setState({ tenantId: null });
  });

  it("auto-selects first organization and displays its name in multi-tenant mode", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationSwitcher />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    expect(useTenantStore.getState().tenantId).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  });
});
