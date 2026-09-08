import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/render-hook";
import { useCreateNoteMutation, useDeleteNoteMutation } from "./notes.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { notes: { create: vi.fn(), remove: vi.fn() } };

describe("mobile notes mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("creates a note and invalidates the notes subtree", async () => {
    const note = { id: "n-1", title: "T", content: "C" };
    client.notes.create.mockResolvedValue({ status: 201, body: note });
    const { result, queryClient } = renderHookWithProviders(() => useCreateNoteMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const onSuccess = vi.fn();
    const { result: withCb } = renderHookWithProviders(() => useCreateNoteMutation({ onSuccess }));

    let created: unknown;
    await result.current.mutateAsync({ title: "T", content: "C" }).then((n) => {
      created = n;
    });
    await withCb.current.mutateAsync({ title: "T", content: "C" });

    expect(created).toBe(note);
    expect(client.notes.create).toHaveBeenCalledWith({ body: { title: "T", content: "C" } });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["notes"] });
    expect(onSuccess).toHaveBeenCalledWith(note);
  });

  it("throws createFailed on non-201 responses", async () => {
    client.notes.create.mockResolvedValue({ status: 400, body: null });
    const { result } = renderHookWithProviders(() => useCreateNoteMutation());

    await expect(result.current.mutateAsync({ title: "T", content: "C" })).rejects.toThrow(
      "api.note.createFailed",
    );
  });

  it("deletes a note and invalidates the notes subtree on 204", async () => {
    client.notes.remove.mockResolvedValue({ status: 204, body: null });
    const { result, queryClient } = renderHookWithProviders(() => useDeleteNoteMutation());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync("n-1");

    expect(client.notes.remove).toHaveBeenCalledWith("n-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["notes"] });
  });

  it("throws deleteFailed unless the server returns 204", async () => {
    client.notes.remove.mockResolvedValue({ status: 500, body: null });
    const { result } = renderHookWithProviders(() => useDeleteNoteMutation());

    await expect(result.current.mutateAsync("n-1")).rejects.toThrow("api.note.deleteFailed");
  });
});
