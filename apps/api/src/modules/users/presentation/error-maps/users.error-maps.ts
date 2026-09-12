import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const CREATE_USER_ERROR_MAP: ErrorMap = {
  EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
  USER_EVENT_DISPATCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.eventDispatchFailed",
  },
  TRANSACTION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.transactionFailed",
  },
};

export const UPDATE_USER_ERROR_MAP: ErrorMap = {
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
  EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
  USER_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.forbidden" },
};

export const GET_USER_ERROR_MAP: ErrorMap = {
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
};

export const DELETE_USER_ERROR_MAP: ErrorMap = {
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
  USER_OWNS_ORGANIZATION: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.user.ownsOrganization",
  },
  USER_EVENT_DISPATCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.eventDispatchFailed",
  },
};

export const AVATAR_ERRORS: ErrorMap = {
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
  INVALID_AVATAR_FILE: { status: HttpStatus.BAD_REQUEST, i18nKey: "api.user.invalidAvatar" },
  FILE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.file.notFound" },
  UNAUTHORIZED: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.unauthorized" },
  UPLOAD_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.uploadFailed",
  },
  UPLOAD_IN_PROGRESS: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.file.uploadNotReady",
  },
  DELETE_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.deleteFailed",
  },
};
