import type { z } from 'zod';
import type {
  deadWebhookEventSchema,
  deadWebhookEventsResultSchema,
  ingestWebhookEventResultSchema,
  manageSourceLocationBindingsResultSchema,
  replayDeadWebhookEventResultSchema,
  sourceLocationBindingChangeSchema,
  sourceLocationBindingRejectionSchema,
} from './webhook-ingestion.contracts.ts';

export type IngestWebhookEventResult = z.infer<
  typeof ingestWebhookEventResultSchema
>;
export type DeadWebhookEvent = z.infer<typeof deadWebhookEventSchema>;
export type DeadWebhookEventsResult = z.infer<
  typeof deadWebhookEventsResultSchema
>;
export type ReplayDeadWebhookEventResult = z.infer<
  typeof replayDeadWebhookEventResultSchema
>;
export type SourceLocationBindingChange = z.infer<
  typeof sourceLocationBindingChangeSchema
>;
export type SourceLocationBindingRejection = z.infer<
  typeof sourceLocationBindingRejectionSchema
>;
export type ManageSourceLocationBindingsResult = z.infer<
  typeof manageSourceLocationBindingsResultSchema
>;
