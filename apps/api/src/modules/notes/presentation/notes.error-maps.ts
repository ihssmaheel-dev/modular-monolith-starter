import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../common/utils/presentation.utils";

export const ATTACH_FILE_ERRORS: ErrorMap = {
  NOTE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.note.notFound" },
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
