import { HttpStatus } from "@nestjs/common";
import type { ErrorMap } from "../../../../common/utils/presentation.utils";

export const ORGANIZATION_ERRORS: ErrorMap = {
  ORGANIZATION_SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.tenancy.slugTaken",
  },
  TENANCY_OPERATION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.tenancy.operationFailed",
  },
  TENANCY_EVENT_DISPATCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.eventDispatchFailed",
  },
};

export const MEMBERSHIP_ERRORS: ErrorMap = {
  TENANT_REQUIRED: { status: HttpStatus.BAD_REQUEST, i18nKey: "api.tenancy.tenantRequired" },
  MEMBERSHIP_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    i18nKey: "api.tenancy.membershipNotFound",
  },
  MEMBERSHIP_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.tenancy.membershipExists",
  },
  TENANT_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.forbidden" },
  LAST_OWNER: { status: HttpStatus.CONFLICT, i18nKey: "api.tenancy.lastOwner" },
  TENANCY_OPERATION_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.tenancy.operationFailed",
  },
  TENANCY_EVENT_DISPATCH_FAILED: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    i18nKey: "api.error.eventDispatchFailed",
  },
};

export const INVITATION_ERRORS: ErrorMap = {
  ...MEMBERSHIP_ERRORS,
  INVITATION_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    i18nKey: "api.tenancy.invitationExists",
  },
  INVITATION_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    i18nKey: "api.tenancy.invitationInvalid",
  },
  INVITATION_EMAIL_MISMATCH: {
    status: HttpStatus.FORBIDDEN,
    i18nKey: "api.tenancy.invitationEmailMismatch",
  },
};
