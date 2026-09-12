import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetNotesQuery } from "./get-notes.query";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { Note } from "../../domain/entities/note.entity";
import { ok } from "neverthrow";
import type { PaginatedResult } from "../../../../infrastructure/database";

const ACTOR = { sub: "admin-1", email: "admin@example.com", role: "admin" } as const;

describe("GetNotesQuery", () => {
  let query: GetNotesQuery;
  let repository: NotesRepository;

  beforeEach(() => {
    repository = {
      paginate: vi.fn(),
    } as unknown as NotesRepository;

    query = new GetNotesQuery(repository);
  });

  it("should return paginated notes with default options", async () => {
    // Arrange
    const paginatedResult: PaginatedResult<Note> = {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };
    vi.mocked(repository.paginate).mockResolvedValue(ok(paginatedResult));

    // Act
    const result = await query.execute({}, ACTOR);

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(paginatedResult);
    }
    expect(repository.paginate).toHaveBeenCalledWith(
      {},
      {
        page: 1,
        limit: 20,
        sort: { createdAt: -1 },
      },
    );
  });

  it("should return paginated notes with custom options", async () => {
    // Arrange
    const paginatedResult: PaginatedResult<Note> = {
      items: [],
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: true,
    };
    vi.mocked(repository.paginate).mockResolvedValue(ok(paginatedResult));

    // Act
    const result = await query.execute({ page: 2, limit: 10 }, ACTOR);

    // Assert
    expect(result.isOk()).toBe(true);
    expect(repository.paginate).toHaveBeenCalledWith(
      {},
      {
        page: 2,
        limit: 10,
        sort: { createdAt: -1 },
      },
    );
  });
});
