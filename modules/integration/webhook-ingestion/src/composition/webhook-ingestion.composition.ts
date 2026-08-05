import type { Database } from '@pressly/db/client';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { makeReconcileSourceLocationBindings } from '../features/bindings/reconcile-source-location-bindings/reconcile-source-location-bindings.usecase.ts';
import { makePostgresReconcileSourceLocationBindingsRepository } from '../features/bindings/reconcile-source-location-bindings/reconcile-source-location-bindings.repo.ts';
import { makeResolveSourceLocation } from '../features/bindings/resolve-source-location/resolve-source-location.usecase.ts';
import { makePostgresResolveSourceLocationRepository } from '../features/bindings/resolve-source-location/resolve-source-location.repo.ts';
import { makeClaimWebhookEvents } from '../features/inbox/claim-events/claim-events.usecase.ts';
import { makePostgresClaimWebhookEventsRepository } from '../features/inbox/claim-events/claim-events.repo.ts';
import { makeCompleteWebhookEventRepository } from '../features/inbox/complete-event/complete-event.repo.ts';
import { makeCompleteWebhookEvent } from '../features/inbox/complete-event/complete-event.usecase.ts';
import { makeDeadLetterWebhookEvent } from '../features/inbox/dead-letter-event/dead-letter-event.usecase.ts';
import { makePostgresDeadLetterWebhookEventRepository } from '../features/inbox/dead-letter-event/dead-letter-event.repo.ts';
import { makeIngestWebhookEventRepository } from '../features/inbox/ingest-event/ingest-event.repo.ts';
import { makeIngestWebhookEvent } from '../features/inbox/ingest-event/ingest-event.usecase.ts';
import { makeListDeadWebhookEvents } from '../features/inbox/list-dead-events/list-dead-events.usecase.ts';
import { makePostgresListDeadWebhookEventsRepository } from '../features/inbox/list-dead-events/list-dead-events.repo.ts';
import { makeMeasureWebhookBacklog } from '../features/inbox/measure-webhook-backlog/measure-webhook-backlog.usecase.ts';
import { makePostgresMeasureWebhookBacklogRepository } from '../features/inbox/measure-webhook-backlog/measure-webhook-backlog.repo.ts';
import { makeReplayDeadWebhookEvent } from '../features/inbox/replay-dead-event/replay-dead-event.usecase.ts';
import { makePostgresReplayDeadWebhookEventRepository } from '../features/inbox/replay-dead-event/replay-dead-event.repo.ts';
import { makeRetryWebhookEvent } from '../features/inbox/retry-event/retry-event.usecase.ts';
import { makePostgresRetryWebhookEventRepository } from '../features/inbox/retry-event/retry-event.repo.ts';
import { makeCaptureWebhookReceipt } from '../features/quarantine/capture-webhook-receipt/capture-webhook-receipt.usecase.ts';
import { DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS } from '../features/quarantine/capture-webhook-receipt/capture-webhook-receipt.policy.ts';
import { makePostgresCaptureWebhookReceiptRepository } from '../features/quarantine/capture-webhook-receipt/capture-webhook-receipt.repo.ts';
import { makeLinkWebhookReceipt } from '../features/quarantine/link-webhook-receipt/link-webhook-receipt.usecase.ts';
import { makePostgresLinkWebhookReceiptRepository } from '../features/quarantine/link-webhook-receipt/link-webhook-receipt.repo.ts';
import { makePurgeExpiredWebhookReceipts } from '../features/quarantine/purge-expired-webhook-receipts/purge-expired-webhook-receipts.usecase.ts';
import { makePostgresPurgeExpiredWebhookReceiptsRepository } from '../features/quarantine/purge-expired-webhook-receipts/purge-expired-webhook-receipts.repo.ts';

export type WebhookIngestionApplicationDeps = Readonly<{
  db: Database;
  clock: Clock;
  ids: IdSource;
  quarantineRetentionMs?: number;
}>;

export const makePostgresWebhookIngestionApplication = (
  deps: WebhookIngestionApplicationDeps,
) => {
  const completionRepo = makeCompleteWebhookEventRepository(deps.db);
  const quarantineRetentionMs =
    deps.quarantineRetentionMs ?? DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS;

  return {
    ingestEvent: makeIngestWebhookEvent({
      repo: makeIngestWebhookEventRepository(deps),
      clock: deps.clock,
    }),
    captureReceipt: makeCaptureWebhookReceipt({
      repo: makePostgresCaptureWebhookReceiptRepository(deps.db),
      clock: deps.clock,
      ids: deps.ids,
      retentionMs: quarantineRetentionMs,
    }),
    linkReceipt: makeLinkWebhookReceipt({
      repo: makePostgresLinkWebhookReceiptRepository(deps.db),
      clock: deps.clock,
    }),
    purgeExpiredReceipts: makePurgeExpiredWebhookReceipts({
      repo: makePostgresPurgeExpiredWebhookReceiptsRepository(deps.db),
      clock: deps.clock,
    }),
    measureBacklog: makeMeasureWebhookBacklog({
      repo: makePostgresMeasureWebhookBacklogRepository(deps.db),
      clock: deps.clock,
    }),
    claimEvents: makeClaimWebhookEvents({
      repo: makePostgresClaimWebhookEventsRepository(deps.db),
      clock: deps.clock,
    }),
    completeEvent: makeCompleteWebhookEvent({
      repo: completionRepo,
      clock: deps.clock,
    }),
    retryEvent: makeRetryWebhookEvent(
      makePostgresRetryWebhookEventRepository(deps.db),
    ),
    deadLetterEvent: makeDeadLetterWebhookEvent(
      makePostgresDeadLetterWebhookEventRepository(deps.db),
    ),
    listDeadEvents: makeListDeadWebhookEvents({
      repo: makePostgresListDeadWebhookEventsRepository(deps.db),
      clock: deps.clock,
    }),
    replayDeadEvent: makeReplayDeadWebhookEvent({
      repo: makePostgresReplayDeadWebhookEventRepository(deps.db),
      clock: deps.clock,
    }),
    resolveSourceLocation: makeResolveSourceLocation(
      makePostgresResolveSourceLocationRepository(deps.db),
    ),
    manageSourceLocationBindings: makeReconcileSourceLocationBindings({
      repo: makePostgresReconcileSourceLocationBindingsRepository(deps.db),
      clock: deps.clock,
    }),
  };
};

export type WebhookIngestionApplication = ReturnType<
  typeof makePostgresWebhookIngestionApplication
>;
