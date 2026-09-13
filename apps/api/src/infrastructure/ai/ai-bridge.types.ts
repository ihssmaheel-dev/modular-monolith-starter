export type AiBridgeErrorCode =
  "AI_DISABLED" | "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_INVALID_RESPONSE" | "AI_CIRCUIT_OPEN";

export interface AiBridgeError {
  type: AiBridgeErrorCode;
  message: string;
  cause?: unknown;
}
