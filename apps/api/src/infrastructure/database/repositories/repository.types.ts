export type Id = string;

export interface BaseFindOptions {
  sort?: string | Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
}

export interface PaginationOptions extends BaseFindOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorPaginationOptions extends BaseFindOptions {
  cursor?: string;
  limit?: number;
  cursorField?: string;
  direction?: "asc" | "desc";
}

export interface CursorPaginatedResult<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface CreateOptions {
  audit?: boolean;
}

export interface UpdateOptions extends BaseFindOptions {
  audit?: boolean;
}

export type DeleteOptions = Pick<UpdateOptions, "includeDeleted" | "onlyDeleted">;
export type SoftDeleteOptions = Pick<UpdateOptions, "audit">;
