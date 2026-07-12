import type { WebhookIngestionClockPort } from '../webhook-ingestion.port.ts';
import type {
  ClaimWebhookEvents,
  ClaimWebhookEventsRepository,
  MeasureWebhookBacklog,
} from './claim-events.port.ts';

export const makeClaimWebhookEvents =
  (deps: {
    repo: ClaimWebhookEventsRepository;
    clock: WebhookIngestionClockPort;
  }): ClaimWebhookEvents =>
  (input) =>
    deps.repo.claim({ ...input, now: deps.clock.now() });

export const makeMeasureWebhookBacklog =
  (deps: {
    repo: ClaimWebhookEventsRepository;
    clock: WebhookIngestionClockPort;
  }): MeasureWebhookBacklog =>
  () =>
    deps.repo.measureBacklog(deps.clock.now());
