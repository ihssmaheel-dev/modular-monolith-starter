export const APP_NAME = "monorepo";
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const API_VERSION = "v1";
export const API_ROOT_PATH = "/api";
export const API_GLOBAL_PREFIX = `${API_ROOT_PATH.slice(1)}/${API_VERSION}`;
export const API_BASE_PATH = `${API_ROOT_PATH}/${API_VERSION}`;
export const API_DOCS_PATH = `${API_ROOT_PATH}/docs`;

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
export const EMAIL_CHANGE_TTL_HOURS = 24;
export const MILLISECONDS_PER_MINUTE = 60_000;
export const MILLISECONDS_PER_HOUR = 3_600_000;

export * from "./tenancy.constants";
export * from "./frontend-routes.constants";
export * from "./notification.constants";
