import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../common/utils/presentation.utils";

export const EXPORT_ERRORS: ErrorMap = {
  EXPORT_FAILED: { status: HttpStatus.INTERNAL_SERVER_ERROR, i18nKey: "api.privacy.exportFailed" },
  DSR_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.privacy.requestNotFound" },
  DSR_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.forbidden" },
  DSR_EXPIRED: { status: HttpStatus.GONE, i18nKey: "api.privacy.exportExpired" },
};

export const ERASURE_ERRORS: ErrorMap = {
  ERASURE_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.privacy.erasureFailed",
  },
  INVALID_PASSWORD: { status: HttpStatus.UNAUTHORIZED, i18nKey: "api.privacy.invalidPassword" },
  INVALID_CONFIRMATION: {
    status: HttpStatus.BAD_REQUEST,
    i18nKey: "api.privacy.invalidConfirmation",
  },
  ORG_ERASE_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.privacy.orgEraseForbidden" },
  ERASURE_ALREADY_REQUESTED: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.privacy.alreadyRequested",
  },
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
};
