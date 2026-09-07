import type {
  AttachAvatarInput,
  CreateUserInput,
  PaginationQuery,
  UpdateUserInput,
  UserListResponse,
  UserResponse,
} from "@repo/contracts";
import { EmptyResponseSchema, UserListResponseSchema, UserResponseSchema } from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";
import { normalizePagination } from "../utils";

export function createUsersClient(fetchFn: FetchFn, orpc?: OrpcClient) {
  return {
    list: (req: { query?: PaginationQuery } = {}) => {
      if (orpc) {
        return orpcResponse(
          () => orpc.users.list(normalizePagination(req.query)),
          200,
          UserListResponseSchema,
        );
      }
      const sp = new URLSearchParams();
      if (req.query?.page) sp.set("page", String(req.query.page));
      if (req.query?.limit) sp.set("limit", String(req.query.limit));
      const qs = sp.toString();
      return fetchFn<UserListResponse>(`/users${qs ? `?${qs}` : ""}`, {}, UserListResponseSchema);
    },
    getById: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.users.getById({ id: req.params.id }), 200, UserResponseSchema)
        : fetchFn<UserResponse>(
            `/users/${encodeURIComponent(req.params.id)}`,
            {},
            UserResponseSchema,
          ),
    create: (req: { body: CreateUserInput }) =>
      orpc
        ? orpcResponse(() => orpc.users.create(req.body), 201, UserResponseSchema)
        : fetchFn<UserResponse>(
            "/users",
            {
              method: "POST",
              body: JSON.stringify(req.body),
            },
            UserResponseSchema,
          ),
    update: (req: { params: { id: string }; body: UpdateUserInput }) =>
      orpc
        ? orpcResponse(
            () => orpc.users.update({ id: req.params.id, ...req.body }),
            200,
            UserResponseSchema,
          )
        : fetchFn<UserResponse>(
            `/users/${encodeURIComponent(req.params.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify(req.body),
            },
            UserResponseSchema,
          ),
    delete: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.users.delete({ id: req.params.id }), 204, EmptyResponseSchema)
        : fetchFn<void>(`/users/${encodeURIComponent(req.params.id)}`, { method: "DELETE" }),
    attachAvatar: (body: AttachAvatarInput) =>
      orpc
        ? orpcResponse(() => orpc.users.attachAvatar(body), 201, UserResponseSchema)
        : fetchFn<UserResponse>(
            "/users/me/avatar",
            { method: "POST", body: JSON.stringify(body) },
            UserResponseSchema,
          ),
    removeAvatar: () =>
      orpc
        ? orpcResponse(() => orpc.users.removeAvatar(), 200, UserResponseSchema)
        : fetchFn<UserResponse>("/users/me/avatar", { method: "DELETE" }, UserResponseSchema),
  };
}
