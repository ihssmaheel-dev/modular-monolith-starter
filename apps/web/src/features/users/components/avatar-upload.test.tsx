import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { renderWithProviders } from "@/test/utils";
import { AvatarUpload } from "./avatar-upload";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));
vi.mock("@repo/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/api-client")>()),
  uploadFile: vi.fn(),
}));

vi.mock("@repo/ui/lib/crop-image", () => ({
  DEFAULT_AVATAR_SIZE: 512,
  getCroppedImg: vi.fn().mockImplementation(async () => {
    return new File(["mock-webp-bytes"], "avatar.webp", { type: "image/webp" });
  }),
}));

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
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-avatar");
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(uploadFile).mockResolvedValue({ id: "file-new" } as never);
    client.users.attachAvatar.mockResolvedValue({
      status: 201,
      body: { ...user, avatarFileId: "file-new" },
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
    expect(screen.queryByText("Adjust profile photo")).not.toBeInTheDocument();
    expect(client.files.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("hides the remove action when no avatar is set", () => {
    signInAs({ id: "u-1", email: "u@e.test", name: "Ada User", role: "user" });
    renderWithProviders(<AvatarUpload />);

    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.getByText("AU")).toBeInTheDocument();
  });

  it("opens the cropper dialog when a valid image is selected", async () => {
    const { container } = renderWithProviders(<AvatarUpload />);
    const input = container.querySelector('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(["valid-img"], "profile.png", { type: "image/png" })] },
    });

    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(await screen.findByText("Adjust profile photo")).toBeInTheDocument();
    expect(screen.getByText("Save photo")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("canceling the cropper closes dialog and cleans up object URL without upload", async () => {
    const viewer = userEvent.setup();
    const { container } = renderWithProviders(<AvatarUpload />);
    const input = container.querySelector('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(["valid-img"], "profile.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("Adjust profile photo")).toBeInTheDocument();

    await viewer.click(screen.getByRole("button", { name: "Cancel" }));

    await vi.waitFor(() => {
      expect(screen.queryByText("Adjust profile photo")).not.toBeInTheDocument();
    });
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/mock-avatar",
    );
    expect(client.users.attachAvatar).not.toHaveBeenCalled();
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it("confirming the cropper saves photo and updates avatar", async () => {
    const viewer = userEvent.setup();
    const { container } = renderWithProviders(<AvatarUpload />);
    const input = container.querySelector('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(["valid-img"], "profile.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("Adjust profile photo")).toBeInTheDocument();

    await viewer.click(screen.getByRole("button", { name: "Save photo" }));

    await vi.waitFor(() => {
      expect(vi.mocked(uploadFile)).toHaveBeenCalled();
      expect(client.users.attachAvatar).toHaveBeenCalledWith({ fileId: "file-new" });
    });

    await vi.waitFor(() => {
      expect(screen.queryByText("Adjust profile photo")).not.toBeInTheDocument();
    });
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/mock-avatar",
    );
  });
});
