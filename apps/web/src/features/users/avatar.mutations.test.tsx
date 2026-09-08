import { describe, expect, it, vi, beforeEach } from "vitest";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { renderHookWithProviders } from "@/test/utils";
import { useAttachAvatarMutation, useRemoveAvatarMutation } from "./avatar.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));
vi.mock("@repo/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/api-client")>()),
  uploadFile: vi.fn(),
}));
vi.mock("@/features/files/files.mutations", async (importOriginal) => ({
  ...((await importOriginal<typeof import("@/features/files/files.mutations")>()) as object),
  putBytesWithProgress: vi.fn().mockResolvedValue(undefined),
}));

const png = (overrides: Partial<{ type: string }> = {}, bytes: number[] = [1]) =>
  new File([new Uint8Array(bytes)], "avatar.png", { type: "image/png", ...overrides });

const bigPng = () => {
  const chunk = new Uint8Array(1024 * 1024);
  return new File([chunk, chunk, chunk, chunk, chunk, chunk], "avatar.png", {
    type: "image/png",
  });
};

const client = {
  files: { requestUpload: vi.fn(), confirmUpload: vi.fn() },
  users: { attachAvatar: vi.fn(), removeAvatar: vi.fn() },
};

describe("avatar mutations", () => {
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
      result.current.mutateAsync({
        file: new File(["x"], "evil.pdf", { type: "application/pdf" }),
        onProgress: () => undefined,
      }),
    ).rejects.toThrow("api.user.invalidAvatar");
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it("rejects oversized files before any upload", async () => {
    const { result } = renderHookWithProviders(() => useAttachAvatarMutation());

    await expect(
      result.current.mutateAsync({
        file: bigPng(),
        onProgress: () => undefined,
      }),
    ).rejects.toThrow("api.user.invalidAvatar");
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it("attaches the uploaded file and stores the user", async () => {
    const uploaded = { id: "file-1" };
    vi.mocked(uploadFile).mockResolvedValue(uploaded as never);
    const user = { id: "u-1", email: "u@e.test", name: "U", role: "user", avatarFileId: "file-1" };
    client.users.attachAvatar.mockResolvedValue({ status: 201, body: user });
    const { result } = renderHookWithProviders(() => useAttachAvatarMutation());

    await result.current.mutateAsync({ file: png(), onProgress: () => undefined });

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
