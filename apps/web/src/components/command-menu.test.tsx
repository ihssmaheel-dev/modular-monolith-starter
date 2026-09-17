import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { CommandMenu } from "./command-menu";
import { useAuthStore } from "@/stores/auth.store";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSetTheme = vi.fn();
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: mockSetTheme,
  }),
}));

describe("CommandMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "test-token",
      refreshToken: "test-refresh",
      user: {
        id: "u-1",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        avatarFileId: null,
      },
    });
  });

  it("toggles open state when Ctrl+K or Cmd+K is pressed", () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandMenu open={false} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders navigation and theme options when open", () => {
    renderWithProviders(<CommandMenu open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/notes/i)).toBeInTheDocument();
    expect(screen.getByText(/notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });

  it("navigates and closes the dialog when an item is selected", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandMenu open={true} onOpenChange={onOpenChange} />);

    const dashboardItem = screen.getByText(/dashboard/i);
    await user.click(dashboardItem);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("switches theme when a theme item is selected", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandMenu open={true} onOpenChange={onOpenChange} />);

    const darkThemeItem = screen.getByText(/dark/i);
    await user.click(darkThemeItem);

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
