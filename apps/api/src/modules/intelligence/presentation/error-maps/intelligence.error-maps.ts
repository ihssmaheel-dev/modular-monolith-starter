import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const INTELLIGENCE_ERRORS: ErrorMap = {
  AI_DISABLED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "intelligence.errors.disabled",
  },
  AI_SERVICE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    i18nKey: "intelligence.errors.unavailable",
  },
  AI_REQUEST_TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    i18nKey: "intelligence.errors.timeout",
  },
  AI_RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    i18nKey: "intelligence.errors.rateLimited",
  },
  AI_INVALID_MODEL: {
    status: HttpStatus.BAD_REQUEST,
    i18nKey: "intelligence.errors.invalidModel",
  },
  AI_PAYLOAD_TOO_LARGE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    i18nKey: "intelligence.errors.payloadTooLarge",
  },
  AI_UNAUTHORIZED: {
    status: HttpStatus.UNAUTHORIZED,
    i18nKey: "intelligence.errors.unauthorized",
  },
};
