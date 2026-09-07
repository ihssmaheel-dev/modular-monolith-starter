import { oc } from "@orpc/contract";
import {
  CreateUserSchema,
  UpdateUserSchema,
  UserResponseSchema,
  UserListResponseSchema,
  UserIdParamSchema,
} from "../schemas/user.schema";
import { AttachAvatarSchema } from "../schemas/file.schema";
import { PaginationQuerySchema } from "../schemas/pagination.schema";
import { EmptyResponseSchema } from "../schemas/common.schema";

export const usersContract = oc.prefix("/users").router({
  list: oc
    .route({ method: "GET", path: "/", summary: "List users" })
    .input(PaginationQuerySchema)
    .output(UserListResponseSchema),
  getById: oc
    .route({ method: "GET", path: "/{id}", summary: "Get user by ID" })
    .input(UserIdParamSchema)
    .output(UserResponseSchema),
  create: oc
    .route({ method: "POST", path: "/", summary: "Create user", successStatus: 201 })
    .input(CreateUserSchema)
    .output(UserResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/{id}", summary: "Update user" })
    .input(UserIdParamSchema.and(UpdateUserSchema))
    .output(UserResponseSchema),
  delete: oc
    .route({ method: "DELETE", path: "/{id}", summary: "Delete user", successStatus: 204 })
    .input(UserIdParamSchema)
    .output(EmptyResponseSchema),
  attachAvatar: oc
    .route({
      method: "POST",
      path: "/me/avatar",
      summary: "Attach my profile avatar",
      successStatus: 201,
    })
    .input(AttachAvatarSchema)
    .output(UserResponseSchema),
  removeAvatar: oc
    .route({ method: "DELETE", path: "/me/avatar", summary: "Remove my profile avatar" })
    .output(UserResponseSchema),
});
