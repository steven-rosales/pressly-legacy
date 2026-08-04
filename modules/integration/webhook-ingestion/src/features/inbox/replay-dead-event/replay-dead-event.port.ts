import type { Result } from '@pressly/kernel';
import type { ReplayDeadWebhookEventFailure } from './replay-dead-event.failure.ts';
import type {
  ReplayDeadWebhookEventCommand,
  ReplayDeadWebhookEventResult,
} from './replay-dead-event.model.ts';

export type ReplayDeadWebhookEvent = (
  command: ReplayDeadWebhookEventCommand,
) => Promise<
  Result<ReplayDeadWebhookEventResult, ReplayDeadWebhookEventFailure>
>;
