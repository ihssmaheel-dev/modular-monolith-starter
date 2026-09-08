import { describe, expect, it, vi, beforeEach } from "vitest";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { renderHookWithProviders } from "@/test/render-hook";
import { useAttachAvatarMutation, useRemoveAvatarMutation } from "./avatar.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));
vi.mock("@repo/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/api-client")>()),
  uploadFile: vi.fn(),
}));

const png = (overrides: Partial<{ contentType: string }> = {}, fileSize = 1) => ({
  uri: "file:///tmp/avatar.png",
  fileName: "avatar.png",
  contentType: "image/png",
  fileSize,
  onProgress: () => undefined,
  ...overrides,
});

const client = {
  files: { requestUpload: vi.fn(), confirmUpload: vi.fn() },
  users: { attachAvatar: vi.fn(), removeAvatar: vi.fn() },
};

describe("mobile avatar mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    useAuthStore.setState({
      status: "unauthenticated",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  });

  it("rejects non-image files before any upload", async () => {
    const { result } = renderHookWithProviders(() => useAttachAvatarMutation());

    await expect(
      result.current.mutateAsync(png({ contentType: "application/pdf" })),
    ).rejects.toThrow("api.user.invalidAvatar");
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it("rejects oversized files before any upload", async () => {
    const { result } = renderHookWithProviders(() => useAttachAvatarMutation());

    await expect(result.current.mutateAsync(png({}, 6 * 1024 * 1024))).rejects.toThrow(
      "api.user.invalidAvatar",
    );
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it("attaches the uploaded file and stores the user", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ id: "file-1" } as never);
    const user = { id: "u-1", email: "u@e.test", name: "U", role: "user", avatarFileId: "file-1" };
    client.users.attachAvatar.mockResolvedValue({ status: 201, body: user });
    const { result } = renderHookWithProviders(() => useAttachAvatarMutation());

    await result.current.mutateAsync(png());

    expect(client.users.attachAvatar).toHaveBeenCalledWith({ fileId: "file-1" });
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("removes the avatar and clears it from the store", async () => {
    const user = { id: "u-1", email: "u@e.test", name: "U", role: "user", avatarFileId: null };
    client.users.removeAvatar.mockResolvedValue({ status: 200, body: user });
    const { result } = renderHookWithProviders(() => useRemoveAvatarMutation());

    await result.current.mutateAsync(undefined);

    expect(useAuthStore.getState().user).toEqual(user);
  });
});
