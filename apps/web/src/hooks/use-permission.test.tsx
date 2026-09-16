import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { usePermission, Can } from "./use-permission";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function TestComponent({ permission }: { permission: string }) {
  const allowed = usePermission(permission as never);
  return <div>{allowed ? "ALLOWED" : "DENIED"}</div>;
}

describe("usePermission and Can", () => {
  beforeEach(() => {
    queryClient.clear();
    useAuthStore.setState({
      user: { id: "user-1", email: "user@test.com", name: "Test User", role: "user" } as never,
      status: "authenticated",
    });
    useTenantStore.setState({ tenantId: null });
  });

  it("denies administrative permission to regular user", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent permission="users:write" />
      </QueryClientProvider>,
    );

    expect(screen.getByText("DENIED")).toBeInTheDocument();
  });

  it("allows administrative permission to admin user", () => {
    useAuthStore.setState({
      user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" } as never,
      status: "authenticated",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent permission="users:write" />
      </QueryClientProvider>,
    );

    expect(screen.getByText("ALLOWED")).toBeInTheDocument();
  });

  it("Can component renders children when allowed and fallback when denied", () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Can permission={"users:write" as never} fallback={<span>NO_ACCESS</span>}>
          <span>SECRET_CONTENT</span>
        </Can>
      </QueryClientProvider>,
    );

    expect(screen.getByText("NO_ACCESS")).toBeInTheDocument();
    expect(screen.queryByText("SECRET_CONTENT")).toBeNull();

    useAuthStore.setState({
      user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" } as never,
      status: "authenticated",
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <Can permission={"users:write" as never} fallback={<span>NO_ACCESS</span>}>
          <span>SECRET_CONTENT</span>
        </Can>
      </QueryClientProvider>,
    );

    expect(screen.getByText("SECRET_CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("NO_ACCESS")).toBeNull();
  });
});
