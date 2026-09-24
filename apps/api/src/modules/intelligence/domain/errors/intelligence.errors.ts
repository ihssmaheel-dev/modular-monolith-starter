export class IntelligenceDisabledError {
  readonly type = "AI_DISABLED" as const;
}

export class IntelligenceUnavailableError {
  readonly type = "AI_SERVICE_UNAVAILABLE" as const;
  constructor(public readonly message?: string) {}
}

export class IntelligenceTimeoutError {
  readonly type = "AI_REQUEST_TIMEOUT" as const;
  constructor(public readonly message?: string) {}
}

export class IntelligenceRateLimitError {
  readonly type = "AI_RATE_LIMITED" as const;
  constructor(public readonly message?: string) {}
}

export class IntelligenceInvalidModelError {
  readonly type = "AI_INVALID_MODEL" as const;
  constructor(public readonly message?: string) {}
}

export class IntelligencePayloadTooLargeError {
  readonly type = "AI_PAYLOAD_TOO_LARGE" as const;
  constructor(public readonly message?: string) {}
}

export class IntelligenceUnauthorizedError {
  readonly type = "AI_UNAUTHORIZED" as const;
  constructor(public readonly message?: string) {}
}

export type IntelligenceError =
  | IntelligenceDisabledError
  | IntelligenceUnavailableError
  | IntelligenceTimeoutError
  | IntelligenceRateLimitError
  | IntelligenceInvalidModelError
  | IntelligencePayloadTooLargeError
  | IntelligenceUnauthorizedError;
