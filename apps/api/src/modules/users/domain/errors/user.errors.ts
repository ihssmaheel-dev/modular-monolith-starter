export type UserNotFound = { type: "USER_NOT_FOUND"; userId: string };
export type EmailTaken = { type: "EMAIL_TAKEN"; email: string };
export type InvalidUserData = { type: "INVALID_USER_DATA"; field: string; reason: string };
export type InvalidPasswordResetToken = { type: "INVALID_PASSWORD_RESET_TOKEN" };
export type InvalidVerificationToken = { type: "INVALID_VERIFICATION_TOKEN" };
export type UserOwnsOrganization = { type: "USER_OWNS_ORGANIZATION" };
export type InvalidAvatarFile = { type: "INVALID_AVATAR_FILE" };
export type UserEventDispatchFailed = { type: "USER_EVENT_DISPATCH_FAILED" };

export type UserError =
  | UserNotFound
  | EmailTaken
  | InvalidUserData
  | InvalidPasswordResetToken
  | InvalidVerificationToken
  | UserOwnsOrganization
  | InvalidAvatarFile
  | UserEventDispatchFailed;

export function formatUserError(error: UserError): string {
  switch (error.type) {
    case "USER_NOT_FOUND":
      return `User not found: ${error.userId}`;
    case "EMAIL_TAKEN":
      return `Email already taken: ${error.email}`;
    case "INVALID_USER_DATA":
      return `Invalid ${error.field}: ${error.reason}`;
    case "INVALID_PASSWORD_RESET_TOKEN":
      return "Invalid password reset token";
    case "INVALID_VERIFICATION_TOKEN":
      return "Invalid email verification token";
    case "USER_OWNS_ORGANIZATION":
      return "User owns an organization";
    case "INVALID_AVATAR_FILE":
      return "Invalid avatar file";
    case "USER_EVENT_DISPATCH_FAILED":
      return "User event dispatch failed";
  }
}
