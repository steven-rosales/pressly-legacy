import type { Database } from '@pressly/db';
import { makeClaimWebhookEventsRepository } from './claim-events/claim-events.repo.ts';
import {
  makeClaimWebhookEvents,
  makeMeasureWebhookBacklog,
} from './claim-events/claim-events.usecase.ts';
import { makeCompleteWebhookEventRepository } from './complete-event/complete-event.repo.ts';
import { makeCompleteWebhookEvent } from './complete-event/complete-event.usecase.ts';
import { makeFailWebhookEventRepository } from './fail-event/fail-event.repo.ts';
import {
  makeDeadLetterWebhookEvent,
  makeRetryWebhookEvent,
} from './fail-event/fail-event.usecase.ts';
import { makeIngestWebhookEventRepository } from './ingest-event/ingest-event.repo.ts';
import { makeIngestWebhookEvent } from './ingest-event/ingest-event.usecase.ts';
import { makeRecoverWebhookEventsRepository } from './recover-events/recover-events.repo.ts';
import {
  makeListDeadWebhookEvents,
  makeReplayDeadWebhookEvent,
} from './recover-events/recover-events.usecase.ts';
import { makeSourceLocationBindingsRepository } from './source-location-bindings/source-location-bindings.repo.ts';
import {
  makeManageSourceLocationBindings,
  makeResolveSourceLocation,
} from './source-location-bindings/source-location-bindings.usecase.ts';
import { makeQuarantineWebhookReceiptsRepository } from './quarantine-receipts/quarantine-receipts.repo.ts';
import {
  DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS,
  makeCaptureWebhookReceipt,
  makeLinkWebhookReceipt,
  makePurgeExpiredWebhookReceipts,
} from './quarantine-receipts/quarantine-receipts.usecase.ts';
import type {
  WebhookIngestionClockPort,
  WebhookIngestionIdPort,
} from './webhook-ingestion.port.ts';

export type WebhookIngestionApplicationDeps = Readonly<{
  db: Database;
  clock: WebhookIngestionClockPort;
  ids: WebhookIngestionIdPort;
  quarantineRetentionMs?: number;
}>;

export const makePostgresWebhookIngestionApplication = (
  deps: WebhookIngestionApplicationDeps,
) => {
  const claimRepo = makeClaimWebhookEventsRepository(deps.db);
  const completionRepo = makeCompleteWebhookEventRepository(deps.db);
  const failureRepo = makeFailWebhookEventRepository(deps.db);
  const recoveryRepo = makeRecoverWebhookEventsRepository(deps.db);
  const bindingsRepo = makeSourceLocationBindingsRepository(deps.db);
  const quarantineRepo = makeQuarantineWebhookReceiptsRepository(deps.db);
  const quarantineRetentionMs =
    deps.quarantineRetentionMs ?? DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS;

  return {
    ingestEvent: makeIngestWebhookEvent({
      repo: makeIngestWebhookEventRepository(deps),
      clock: deps.clock,
    }),
    captureReceipt: makeCaptureWebhookReceipt({
      repo: quarantineRepo,
      clock: deps.clock,
      ids: deps.ids,
      retentionMs: quarantineRetentionMs,
    }),
    linkReceipt: makeLinkWebhookReceipt({
      repo: quarantineRepo,
      clock: deps.clock,
    }),
    purgeExpiredReceipts: makePurgeExpiredWebhookReceipts({
      repo: quarantineRepo,
      clock: deps.clock,
    }),
    measureBacklog: makeMeasureWebhookBacklog({
      repo: claimRepo,
      clock: deps.clock,
    }),
    claimEvents: makeClaimWebhookEvents({
      repo: claimRepo,
      clock: deps.clock,
    }),
    completeEvent: makeCompleteWebhookEvent({
      repo: completionRepo,
      clock: deps.clock,
    }),
    retryEvent: makeRetryWebhookEvent(failureRepo),
    deadLetterEvent: makeDeadLetterWebhookEvent(failureRepo),
    listDeadEvents: makeListDeadWebhookEvents({
      repo: recoveryRepo,
      clock: deps.clock,
    }),
    replayDeadEvent: makeReplayDeadWebhookEvent({
      repo: recoveryRepo,
      clock: deps.clock,
    }),
    resolveSourceLocation: makeResolveSourceLocation(bindingsRepo),
    manageSourceLocationBindings: makeManageSourceLocationBindings({
      repo: bindingsRepo,
      clock: deps.clock,
    }),
  };
};

export type WebhookIngestionApplication = ReturnType<
  typeof makePostgresWebhookIngestionApplication
>;
