import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const EMAIL_TAKEN_ERRORS: ErrorMap = {
  EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "auth.emailTaken" },
  TRANSACTION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.transactionFailed",
  },
};

export const LOGIN_ERRORS: ErrorMap = {
  SESSION_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "api.error.serviceUnavailable",
  },
  INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    i18nKey: "auth.invalidCredentials",
  },
  ACCOUNT_LOCKED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    i18nKey: "auth.accountLocked",
  },
};

export const INVALID_TOKEN_ERRORS: ErrorMap = {
  SESSION_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "api.error.serviceUnavailable",
  },
  INVALID_TOKEN: { status: HttpStatus.UNAUTHORIZED, i18nKey: "auth.invalidToken" },
  USER_NOT_FOUND: { status: HttpStatus.UNAUTHORIZED, i18nKey: "auth.invalidToken" },
};
