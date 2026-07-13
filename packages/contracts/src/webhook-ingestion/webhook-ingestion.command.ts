import type { z } from 'zod';
import type {
  deadWebhookEventParamsSchema,
  deadWebhookEventsQuerySchema,
  ingestWebhookEventCommandSchema,
  replayDeadWebhookEventRequestSchema,
  sourceLocationBindingResourceInputSchema,
  sourceLocationBindingsManifestSchema,
} from './webhook-ingestion.contracts.ts';

export type IngestWebhookEventCommand = z.infer<
  typeof ingestWebhookEventCommandSchema
>;
export type DeadWebhookEventsQuery = z.infer<
  typeof deadWebhookEventsQuerySchema
>;
export type DeadWebhookEventParams = z.infer<
  typeof deadWebhookEventParamsSchema
>;
export type ReplayDeadWebhookEventRequest = z.infer<
  typeof replayDeadWebhookEventRequestSchema
>;
export type SourceLocationBindingResourceInput = z.infer<
  typeof sourceLocationBindingResourceInputSchema
>;
export type SourceLocationBindingsManifest = z.infer<
  typeof sourceLocationBindingsManifestSchema
>;
