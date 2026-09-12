import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetUsersQuery } from "./get-users.query";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { User } from "../../domain/entities/user.entity";
import { ok } from "neverthrow";
import * as contracts from "@repo/contracts";

vi.mock("@repo/contracts", async () => {
  const actual = await vi.importActual("@repo/contracts");
  return {
    ...actual,
    paginate: vi.fn(),
  };
});

describe("GetUsersQuery", () => {
  let query: GetUsersQuery;
  let repository: UsersRepository;

  beforeEach(() => {
    repository = {
      paginate: vi.fn(),
    } as unknown as UsersRepository;

    query = new GetUsersQuery(repository);
  });

  it("should return users and pagination data", async () => {
    // Arrange
    const user = User.fromPersistence({
      id: "123",
      email: "test@example.com",
      name: "Test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(contracts.paginate).mockReturnValue({ page: 2, limit: 5, skip: 5 });
    vi.mocked(repository.paginate).mockResolvedValue(
      ok({
        items: [user],
        total: 1,
        totalPages: 1,
        page: 2,
        limit: 5,
        hasNextPage: false,
        hasPrevPage: true,
      }),
    );

    // Act
    const result = await query.execute(2, 5);

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        users: [user],
        total: 1,
        totalPages: 1,
        page: 2,
        limit: 5,
      });
    }
    expect(repository.paginate).toHaveBeenCalledWith({}, { page: 2, limit: 5 });
  });
});
