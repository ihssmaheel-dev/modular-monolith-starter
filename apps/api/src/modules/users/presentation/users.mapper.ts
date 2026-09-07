import type { UserResponse } from "@repo/contracts";
import { User } from "../domain/entities/user.entity";

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarFileId: user.avatarFileId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
