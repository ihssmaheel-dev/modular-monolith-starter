import { z } from "zod";

export const EmptyResponseSchema = z.undefined().or(z.null()).or(z.void());
export const EmailInputSchema = z.string().trim().toLowerCase().email().max(255);

export type EmptyResponse = z.infer<typeof EmptyResponseSchema>;
