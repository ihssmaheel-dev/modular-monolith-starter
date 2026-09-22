export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  /** Stable provider operation identity for retry deduplication where supported. */
  operationId?: string;
}
