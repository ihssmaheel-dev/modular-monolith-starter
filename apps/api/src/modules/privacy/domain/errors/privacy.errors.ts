export type DsrNotFound = { type: "DSR_NOT_FOUND"; requestId: string };
export type DsrExpired = { type: "DSR_EXPIRED"; requestId: string };
export type DsrForbidden = { type: "DSR_FORBIDDEN" };
export type InvalidPassword = { type: "INVALID_PASSWORD" };
export type InvalidConfirmation = { type: "INVALID_CONFIRMATION" };
export type OrgEraseForbidden = { type: "ORG_ERASE_FORBIDDEN" };
export type ErasureAlreadyRequested = { type: "ERASURE_ALREADY_REQUESTED" };
export type LastOwnerBlocked = { type: "LAST_OWNER_BLOCKED" };
export type ExportFailed = { type: "EXPORT_FAILED" };
export type ExportAdmissionDisabled = { type: "EXPORT_ADMISSION_DISABLED" };
export type ErasureFailed = { type: "ERASURE_FAILED" };
export type PurgeFailed = { type: "PURGE_FAILED" };

export type PrivacyError =
  | DsrNotFound
  | DsrExpired
  | DsrForbidden
  | InvalidPassword
  | InvalidConfirmation
  | OrgEraseForbidden
  | ErasureAlreadyRequested
  | LastOwnerBlocked
  | ExportFailed
  | ExportAdmissionDisabled
  | ErasureFailed
  | PurgeFailed;
