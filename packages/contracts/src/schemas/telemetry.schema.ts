import { z } from "zod";

export const ClientErrorBeaconSchema = z.object({
  message: z.string().min(1).max(1000),
  errorRef: z.string().max(64).optional(),
  stack: z.string().max(4000).optional(),
  url: z.string().max(2000),
  userAgent: z.string().max(500).optional(),
  componentStack: z.string().max(4000).optional(),
});

export type ClientErrorBeacon = z.infer<typeof ClientErrorBeaconSchema>;
