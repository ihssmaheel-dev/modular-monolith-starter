import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { UserRole } from "@repo/contracts";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";

export interface CurrentUserData {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarFileId?: string | null;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type GetCurrentUserError = { type: "USER_NOT_FOUND" } | { type: "INVALID_TOKEN" };

@Injectable()
export class GetCurrentUserQuery {
  constructor(private readonly getUserById: GetUserByIdQuery) {}

  async execute(userId: string): Promise<Result<CurrentUserData, GetCurrentUserError>> {
    const result = await this.getUserById.execute(userId);
    if (result.isErr() || !result.value) {
      return err({ type: "USER_NOT_FOUND" });
    }
    const user = result.value;
    return ok({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarFileId: user.avatarFileId ?? null,
      authVersion: user.authVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }
}
