import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../common/utils/presentation.utils";

export const NOTIFICATION_ERRORS: ErrorMap = {
  NOTIFICATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.notifications.notFound" },
  NOTIFICATION_SEND_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.notifications.sendFailed",
  },
  NOTIFICATION_FETCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.notifications.fetchFailed",
  },
  NOTIFICATION_DISPATCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.notifications.sendFailed",
  },
  UNKNOWN_NOTIFICATION_TYPE: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.internal",
  },
  TRANSACTION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.transactionFailed",
  },
};

export const PREFERENCE_ERRORS: ErrorMap = {
  PREFERENCE_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    i18nKey: "api.notifications.preferenceInvalid",
  },
  TRANSACTION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.transactionFailed",
  },
};

export const DEVICE_ERRORS: ErrorMap = {
  DEVICE_TOKEN_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    i18nKey: "api.notifications.deviceInvalid",
  },
  TRANSACTION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.transactionFailed",
  },
};
