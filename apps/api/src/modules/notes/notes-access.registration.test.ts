import { describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { NotesModule } from "./notes.module";
import { FileAccessRegistry } from "../../common/file-access/file-access.registry";
import type { AuthorizationService } from "../../infrastructure/authorization";
import type { GetNoteByIdQuery } from "./application/queries/get-note-by-id.query";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

function file(parentId?: string) {
  return {
    id: "file-1",
    key: "key",
    parentId,
    parentType: "note",
  } as never;
}

describe("NotesModule file access registration (H10)", () => {
  function setup() {
    const authService = { registerPolicies: vi.fn() } as unknown as AuthorizationService;
    const registry = new FileAccessRegistry();
    const getNoteById = { execute: vi.fn() } as unknown as GetNoteByIdQuery;
    const module = new NotesModule(authService, registry, getNoteById);
    module.onModuleInit();
    return { registry, getNoteById };
  }

  it("registers a note readability checker", async () => {
    const { registry, getNoteById } = setup();
    vi.mocked(getNoteById.execute).mockResolvedValue(ok({ id: "note-1" } as never));

    const checker = registry.getChecker("note");
    expect(checker).toBeDefined();
    await expect(checker!(file("note-1"), ACTOR)).resolves.toBe(true);
    expect(getNoteById.execute).toHaveBeenCalledWith("note-1", ACTOR);
  });

  it("denies when the parent note is unreadable or missing", async () => {
    const { registry, getNoteById } = setup();
    const checker = registry.getChecker("note")!;

    vi.mocked(getNoteById.execute).mockResolvedValue(err({ type: "NOTE_NOT_FOUND" } as never));
    await expect(checker(file("note-1"), ACTOR)).resolves.toBe(false);
    await expect(checker(file(undefined), ACTOR)).resolves.toBe(false);
  });
});
