import { z } from "zod";

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
});

export const UserIdParamSchema = z.object({
  id: z.string().min(1),
});

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["admin", "user"]),
  avatarFileId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UserListResponseSchema = z.object({
  users: z.array(UserResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number().int().positive(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
