import type { WebhookIngestionClockPort } from '../webhook-ingestion.port.ts';
import type {
  CompleteWebhookEvent,
  CompleteWebhookEventRepository,
} from './complete-event.port.ts';

export const makeCompleteWebhookEvent =
  (deps: {
    repo: CompleteWebhookEventRepository;
    clock: WebhookIngestionClockPort;
  }): CompleteWebhookEvent =>
  (claim) =>
    deps.repo.complete({ ...claim, processedAt: deps.clock.now() });
