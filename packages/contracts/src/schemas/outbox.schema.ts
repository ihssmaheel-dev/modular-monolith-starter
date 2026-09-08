import { z } from "zod";

/** Versioned envelope used when an outbox row crosses the durable queue boundary. */
export const OutboxEventIdentitySchema = z.object({ id: z.string().min(1) });

export const OutboxEventEnvelopeSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  version: z.number().int().positive(),
  tenantId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type OutboxEventEnvelope = z.infer<typeof OutboxEventEnvelopeSchema>;

const localeSchema = z.enum(["en", "es", "fr"]);
const payloadSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  "user.created": z.object({
    userId: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
    locale: localeSchema,
  }),
  "user.updated": z.object({
    userId: z.string().min(1),
    changes: z.object({ email: z.string().email().optional(), name: z.string().min(1).optional() }),
  }),
  "user.deleted": z.object({ userId: z.string().min(1) }),
  "note.created": z.object({
    noteId: z.string().min(1),
    userId: z.string().min(1),
    title: z.string(),
    content: z.string(),
    tenantId: z.string().optional(),
  }),
  "note.updated": z.object({
    noteId: z.string().min(1),
    userId: z.string().min(1),
    title: z.string().optional(),
    content: z.string().optional(),
    tenantId: z.string().optional(),
  }),
  "note.deleted": z.object({
    noteId: z.string().min(1),
    userId: z.string().min(1),
    tenantId: z.string().optional(),
  }),
  "tenancy.invitation.created": z.object({
    tenantId: z.string().min(1),
    organizationName: z.string().min(1),
    email: z.string().email(),
    role: z.enum(["admin", "member"]),
    token: z.string().min(1),
    locale: localeSchema,
  }),
  "notification.created": z.object({
    notificationId: z.string().min(1),
    userId: z.string().min(1),
    type: z.string().min(1),
    tenantId: z.string().min(1).optional(),
  }),
  "notification.digest.ready": z.object({
    batchId: z.string().min(1),
    userId: z.string().min(1),
    type: z.string().min(1),
    count: z.number().int().nonnegative(),
    tenantId: z.string().min(1).optional(),
  }),
};

export function parseOutboxEventEnvelope(value: unknown): OutboxEventEnvelope {
  const envelope = OutboxEventEnvelopeSchema.parse(value);
  const payloadSchema = payloadSchemas[envelope.topic];
  if (!payloadSchema) return envelope;
  return { ...envelope, payload: payloadSchema.parse(envelope.payload) };
}
