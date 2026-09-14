import { z } from "zod";

const HealthIndicatorSchema = z.record(z.string(), z.unknown());

export const HealthCheckResponseSchema = z.object({
  status: z.enum(["ok", "error", "shutting_down", "degraded"]),
  info: HealthIndicatorSchema.optional(),
  error: HealthIndicatorSchema.optional(),
  details: HealthIndicatorSchema.optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
