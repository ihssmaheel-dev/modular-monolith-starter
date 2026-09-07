import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { PurgeUserNotesCommand } from "./purge-user-notes.command";
import { NotesRepository } from "../../infrastructure/notes.repository";

function page(ids: string[], totalPages: number) {
  return {
    items: ids.map((id) => ({ id })),
    total: ids.length,
    page: 1,
    limit: 500,
    totalPages,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

describe("PurgeUserNotesCommand", () => {
  let command: PurgeUserNotesCommand;
  let repository: NotesRepository;

  beforeEach(() => {
    repository = {
      paginate: vi.fn(),
      deleteById: vi.fn(),
    } as unknown as NotesRepository;
    command = new PurgeUserNotesCommand(repository);
  });

  it("should delete every page without holding one transaction", async () => {
    const fullPage = Array.from({ length: 500 }, (_, index) => `n${index}`);
    vi.mocked(repository.paginate)
      .mockResolvedValueOnce(ok(page(fullPage, 2) as never))
      .mockResolvedValueOnce(ok(page(["n-last"], 2) as never));
    vi.mocked(repository.deleteById).mockResolvedValue(ok(true));

    const result = await command.execute("user-1");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ deleted: 501 });
    expect(repository.paginate).toHaveBeenCalledWith(
      { createdBy: "user-1" },
      { page: 1, limit: 500 },
    );
    expect(repository.deleteById).toHaveBeenCalledTimes(501);
  });

  it("should stop when a page is empty", async () => {
    vi.mocked(repository.paginate).mockResolvedValue(ok(page([], 1) as never));

    const result = await command.execute("user-1");

    expect(result.isOk()).toBe(true);
    expect(repository.deleteById).not.toHaveBeenCalled();
  });
});
