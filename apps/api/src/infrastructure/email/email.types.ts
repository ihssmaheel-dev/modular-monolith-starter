import type { Result } from "neverthrow";

export interface EmailError {
  code: "SEND_FAILED" | "INVALID_ADDRESS" | "CONFIG_ERROR" | "CIRCUIT_OPEN" | "BULKHEAD_REJECTED";
  message: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Stable operation identifier used for provider-side deduplication where supported. */
  operationId?: string;
}

export interface SendEmailResult {
  id: string;
  provider: "resend" | "smtp";
}

export interface EmailDriver {
  send(recipients: string[], params: SendEmailParams): Promise<Result<SendEmailResult, EmailError>>;
}
