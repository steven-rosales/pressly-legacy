import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const webhookSourceSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const webhookSubjectTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const ingestWebhookEventCommandSchema = z
  .object({
    source: webhookSourceSchema,
    eventType: z.string().trim().min(1).max(200),
    deduplicationKey: sha256HexSchema,
    subjectType: webhookSubjectTypeSchema,
    subjectId: z.string().trim().min(1).max(200).nullable(),
    sourceLocationId: z.string().trim().min(1).max(200).nullable(),
    sourceOccurredAt: utcIsoStringSchema.nullable(),
    payload: z.json().nullable(),
    rawBodySha256: sha256HexSchema,
    disposition: z.enum(['process', 'ignore']),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.disposition === 'process' && event.payload === null)
      context.addIssue({
        code: 'custom',
        path: ['payload'],
        message: 'A processable event requires a canonical payload.',
      });
  });

export const ingestWebhookEventResultSchema = z
  .object({
    eventId: z.uuid(),
    duplicate: z.boolean(),
    status: z.enum(['pending', 'ignored']),
  })
  .strict();

export const deadWebhookEventsQuerySchema = z
  .object({
    source: webhookSourceSchema.optional(),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const deadWebhookEventSchema = z
  .object({
    eventId: z.uuid(),
    source: webhookSourceSchema,
    eventType: z.string().min(1).max(200),
    subjectType: webhookSubjectTypeSchema,
    subjectId: z.string().min(1).nullable(),
    sourceLocationId: z.string().min(1).nullable(),
    sourceOccurredAt: utcIsoStringSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    lastErrorCode: z.string().min(1).max(200).nullable(),
    receivedAt: utcIsoStringSchema,
  })
  .strict();

export const deadWebhookEventsResultSchema = z
  .object({
    items: z.array(deadWebhookEventSchema),
    nextCursor: z.string().min(1).nullable(),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const deadWebhookEventParamsSchema = z
  .object({ eventId: z.uuid() })
  .strict();

export const replayDeadWebhookEventRequestSchema = z
  .object({ confirmation: z.literal('replay-dead-webhook-event') })
  .strict();

export const replayDeadWebhookEventResultSchema = z
  .object({
    eventId: z.uuid(),
    outcome: z.enum(['queued', 'already_queued']),
  })
  .strict();

export const sourceLocationBindingResourceInputSchema = z
  .object({
    source: webhookSourceSchema,
    externalLocationId: z.string().trim().min(1).max(200),
    locationId: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
  })
  .strict();

export const sourceLocationBindingsManifestSchema = z
  .object({
    sourceLocationBindings: z
      .array(sourceLocationBindingResourceInputSchema)
      .min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    manifest.sourceLocationBindings.forEach((binding, index) => {
      const key = `${binding.source}\u0000${binding.externalLocationId}`;
      if (seen.has(key))
        context.addIssue({
          code: 'custom',
          path: ['sourceLocationBindings', index],
          message: `Duplicate source-location binding: ${binding.source}:${binding.externalLocationId}.`,
        });
      seen.add(key);
    });
  });

export const sourceLocationBindingChangeSchema = z
  .object({
    source: webhookSourceSchema,
    externalLocationId: z.string().min(1),
    locationId: z.string().min(1),
    outcome: z.enum(['created', 'noop']),
  })
  .strict();

export const sourceLocationBindingRejectionSchema = z
  .object({
    source: webhookSourceSchema,
    externalLocationId: z.string().min(1),
    code: z.enum([
      'binding_location_change',
      'binding_deactivation',
      'binding_removal',
    ]),
    message: z.string().min(1),
  })
  .strict();

export const manageSourceLocationBindingsResultSchema = z
  .object({
    mode: z.enum(['dry_run', 'apply']),
    status: z.enum(['converged', 'rejected']),
    applied: z.boolean(),
    operations: z.array(sourceLocationBindingChangeSchema),
    rejections: z.array(sourceLocationBindingRejectionSchema),
  })
  .strict();
