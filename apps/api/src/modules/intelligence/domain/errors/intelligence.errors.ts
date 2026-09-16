export type IntelligenceError =
  | { type: "INTELLIGENCE_DISABLED" }
  | { type: "INTELLIGENCE_NOT_CONFIGURED" }
  | { type: "INTELLIGENCE_BUSY" }
  | { type: "INTELLIGENCE_UNAVAILABLE" }
  | { type: "INTELLIGENCE_INVALID_RESPONSE" }
  | { type: "INTELLIGENCE_REQUEST_FAILED" };
