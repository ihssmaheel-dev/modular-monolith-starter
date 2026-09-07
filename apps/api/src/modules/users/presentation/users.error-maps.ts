import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../common/utils/presentation.utils";

export const AVATAR_ERRORS: ErrorMap = {
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
  INVALID_AVATAR_FILE: { status: HttpStatus.BAD_REQUEST, i18nKey: "api.user.invalidAvatar" },
  FILE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.file.notFound" },
  UNAUTHORIZED: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.unauthorized" },
  UPLOAD_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.uploadFailed",
  },
  DELETE_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.deleteFailed",
  },
};
