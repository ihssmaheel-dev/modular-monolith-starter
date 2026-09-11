export type AuthError =
  | { type: "INVALID_CREDENTIALS" }
  | { type: "EMAIL_TAKEN" }
  | { type: "USER_NOT_FOUND" }
  | { type: "INVALID_TOKEN" }
  | { type: "EMAIL_NOT_FOUND" }
  | { type: "ACCOUNT_LOCKED" }
  | { type: "EMAIL_NOT_VERIFIED" }
  | { type: "TRANSACTION_FAILED" };
