export type UserNotFound = { type: "USER_NOT_FOUND"; userId: string };
export type EmailTaken = { type: "EMAIL_TAKEN"; email: string };
export type InvalidUserData = { type: "INVALID_USER_DATA"; field: string; reason: string };
export type InvalidPasswordResetToken = { type: "INVALID_PASSWORD_RESET_TOKEN" };
export type InvalidVerificationToken = { type: "INVALID_VERIFICATION_TOKEN" };
export type InvalidEmailChangeToken = { type: "INVALID_EMAIL_CHANGE_TOKEN" };
export type UserOwnsOrganization = { type: "USER_OWNS_ORGANIZATION" };
export type UserForbidden = { type: "USER_FORBIDDEN"; userId: string };
export type InvalidAvatarFile = { type: "INVALID_AVATAR_FILE" };
export type UserEventDispatchFailed = { type: "USER_EVENT_DISPATCH_FAILED" };

export type UserError =
  | UserNotFound
  | EmailTaken
  | InvalidUserData
  | InvalidPasswordResetToken
  | InvalidVerificationToken
  | InvalidEmailChangeToken
  | UserOwnsOrganization
  | UserForbidden
  | InvalidAvatarFile
  | UserEventDispatchFailed;
