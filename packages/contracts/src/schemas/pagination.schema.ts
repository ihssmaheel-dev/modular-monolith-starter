import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "../constants";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationSchema>;

export interface CursorPaginatedResult<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export function paginate(page = 1, limit = DEFAULT_PAGE_LIMIT) {
  const p = Math.max(1, page || 1);
  const l = Math.min(MAX_PAGE_LIMIT, Math.max(1, limit || DEFAULT_PAGE_LIMIT));
  const skip = (p - 1) * l;
  return { page: p, limit: l, skip };
}
