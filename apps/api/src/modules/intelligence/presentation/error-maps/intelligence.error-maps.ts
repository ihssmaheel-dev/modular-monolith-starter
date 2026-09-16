import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const INTELLIGENCE_ERRORS: ErrorMap = {
  INTELLIGENCE_DISABLED: {
    status: HttpStatus.NOT_FOUND,
    i18nKey: "api.error.notFound",
  },
  INTELLIGENCE_NOT_CONFIGURED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "api.error.serviceUnavailable",
  },
  INTELLIGENCE_BUSY: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    i18nKey: "api.error.serviceUnavailable",
  },
  INTELLIGENCE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "api.error.serviceUnavailable",
  },
  INTELLIGENCE_INVALID_RESPONSE: {
    status: HttpStatus.BAD_GATEWAY,
    i18nKey: "api.error.serviceUnavailable",
  },
  INTELLIGENCE_REQUEST_FAILED: {
    status: HttpStatus.NOT_FOUND,
    i18nKey: "api.error.notFound",
  },
};
