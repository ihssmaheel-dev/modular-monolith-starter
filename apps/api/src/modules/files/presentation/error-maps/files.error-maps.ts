import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const FILE_NOT_FOUND_ERRORS: ErrorMap = {
  FILE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.file.notFound" },
};

export const REQUEST_UPLOAD_ERRORS: ErrorMap = {
  PRESIGN_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.presignFailed",
  },
  UPLOAD_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.uploadFailed",
  },
  FILE_TOO_LARGE: { status: HttpStatus.PAYLOAD_TOO_LARGE, i18nKey: "api.error.fileTooLarge" },
  QUOTA_EXCEEDED: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    i18nKey: "api.error.quotaExceeded",
  },
};

export const CONFIRM_UPLOAD_ERRORS: ErrorMap = {
  ...FILE_NOT_FOUND_ERRORS,
  UPLOAD_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.uploadFailed",
  },
  METADATA_MISMATCH: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    i18nKey: "api.file.metadataMismatch",
  },
};

// Removed GridFS transfer errors — S3 presigned URLs only

export const DOWNLOAD_ERRORS: ErrorMap = {
  ...FILE_NOT_FOUND_ERRORS,
  PRESIGN_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.presignFailed",
  },
};

export const DELETE_FILE_ERRORS: ErrorMap = {
  ...FILE_NOT_FOUND_ERRORS,
  UNAUTHORIZED: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.unauthorized" },
  DELETE_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.deleteFailed",
  },
};
