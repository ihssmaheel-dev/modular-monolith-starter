export type DsrNotFound = { type: "DSR_NOT_FOUND"; requestId: string };
export type DsrExpired = { type: "DSR_EXPIRED"; requestId: string };
export type DsrForbidden = { type: "DSR_FORBIDDEN" };
export type InvalidPassword = { type: "INVALID_PASSWORD" };
export type InvalidConfirmation = { type: "INVALID_CONFIRMATION" };
export type OrgEraseForbidden = { type: "ORG_ERASE_FORBIDDEN" };
export type ErasureAlreadyRequested = { type: "ERASURE_ALREADY_REQUESTED" };
export type LastOwnerBlocked = { type: "LAST_OWNER_BLOCKED" };
export type ExportFailed = { type: "EXPORT_FAILED" };
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
  | ErasureFailed
  | PurgeFailed;

export function formatPrivacyError(error: PrivacyError): string {
  switch (error.type) {
    case "DSR_NOT_FOUND":
      return `Privacy request not found: ${error.requestId}`;
    case "DSR_EXPIRED":
      return `Privacy request expired: ${error.requestId}`;
    case "DSR_FORBIDDEN":
      return "Not allowed to access this privacy request";
    case "INVALID_PASSWORD":
      return "Invalid password";
    case "INVALID_CONFIRMATION":
      return "Confirmation does not match";
    case "ORG_ERASE_FORBIDDEN":
      return "Only organization owners can delete the organization";
    case "ERASURE_ALREADY_REQUESTED":
      return "A deletion request is already in progress";
    case "LAST_OWNER_BLOCKED":
      return "Transfer organization ownership before deleting this account";
    case "EXPORT_FAILED":
      return "Data export failed";
    case "ERASURE_FAILED":
      return "Deletion request failed";
    case "PURGE_FAILED":
      return "Expired request purge failed";
  }
}
