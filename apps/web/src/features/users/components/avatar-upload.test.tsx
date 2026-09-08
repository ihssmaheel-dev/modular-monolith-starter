import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { renderWithProviders } from "@/test/utils";
import { AvatarUpload } from "./avatar-upload";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const user = {
  id: "u-1",
  email: "u@e.test",
  name: "Ada User",
  role: "user",
  avatarFileId: "file-1",
} as const;

const client = {
  files: { getDownloadUrl: vi.fn() },
  users: { attachAvatar: vi.fn(), removeAvatar: vi.fn() },
};

function signInAs(authUser: typeof user | Omit<typeof user, "avatarFileId">) {
  useAuthStore.setState({
    status: "authenticated",
    accessToken: "a",
    refreshToken: "r",
    user: authUser as never,
  });
}

describe("AvatarUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    client.files.getDownloadUrl.mockResolvedValue({
      status: 200,
      body: { downloadUrl: "https://cdn.test/a.png" },
    });
    signInAs(user);
  });

  afterEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it("resolves the preview through the download URL", async () => {
    renderWithProviders(<AvatarUpload />);

    await vi.waitFor(() => {
      expect(client.files.getDownloadUrl).toHaveBeenCalledWith({ params: { id: "file-1" } });
    });
    expect(screen.getByText("AU")).toBeInTheDocument();
  });

  it("clears the stale preview and store reference after remove", async () => {
    const viewer = userEvent.setup();
    client.users.removeAvatar.mockResolvedValue({
      status: 200,
      body: { ...user, avatarFileId: null },
    });
    const { container } = renderWithProviders(<AvatarUpload />);
    await screen.findByRole("button", { name: "Remove photo" });

    await viewer.click(screen.getByRole("button", { name: "Remove photo" }));

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.avatarFileId).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.test/a.png"]')).toBeNull();
  });

  it("rejects non-image files before any upload starts", async () => {
    const { container } = renderWithProviders(<AvatarUpload />);
    const input = container.querySelector('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] },
    });

    await vi.waitFor(() => {
      expect(client.users.attachAvatar).not.toHaveBeenCalled();
    });
    expect(client.files.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("hides the remove action when no avatar is set", () => {
    signInAs({ id: "u-1", email: "u@e.test", name: "Ada User", role: "user" });
    renderWithProviders(<AvatarUpload />);

    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.getByText("AU")).toBeInTheDocument();
  });
});
