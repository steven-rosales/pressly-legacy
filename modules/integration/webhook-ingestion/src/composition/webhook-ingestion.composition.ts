import type { Database } from '@pressly/db/client';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { makeReconcileSourceLocationBindings } from '../features/bindings/reconcile-source-location-bindings/reconcile-source-location-bindings.usecase.ts';
import { makeResolveSourceLocation } from '../features/bindings/resolve-source-location/resolve-source-location.usecase.ts';
import { makeClaimWebhookEvents } from '../features/inbox/claim-events/claim-events.usecase.ts';
import { makeCompleteWebhookEventRepository } from '../features/inbox/complete-event/complete-event.repo.ts';
import { makeCompleteWebhookEvent } from '../features/inbox/complete-event/complete-event.usecase.ts';
import { makeDeadLetterWebhookEvent } from '../features/inbox/dead-letter-event/dead-letter-event.usecase.ts';
import { makeIngestWebhookEventRepository } from '../features/inbox/ingest-event/ingest-event.repo.ts';
import { makeIngestWebhookEvent } from '../features/inbox/ingest-event/ingest-event.usecase.ts';
import { makeListDeadWebhookEvents } from '../features/inbox/list-dead-events/list-dead-events.usecase.ts';
import { makeMeasureWebhookBacklog } from '../features/inbox/measure-webhook-backlog/measure-webhook-backlog.usecase.ts';
import { makeReplayDeadWebhookEvent } from '../features/inbox/replay-dead-event/replay-dead-event.usecase.ts';
import { makeRetryWebhookEvent } from '../features/inbox/retry-event/retry-event.usecase.ts';
import {
  DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS,
  makeCaptureWebhookReceipt,
} from '../features/quarantine/capture-webhook-receipt/capture-webhook-receipt.usecase.ts';
import { makeLinkWebhookReceipt } from '../features/quarantine/link-webhook-receipt/link-webhook-receipt.usecase.ts';
import { makePurgeExpiredWebhookReceipts } from '../features/quarantine/purge-expired-webhook-receipts/purge-expired-webhook-receipts.usecase.ts';
import { makePostgresDeadWebhookEventStore } from '../foundations/adapters/postgres/dead-webhook-event-store/dead-webhook-event-store.repo.ts';
import { makePostgresSourceLocationBindingStore } from '../foundations/adapters/postgres/source-location-binding-store/source-location-binding-store.repo.ts';
import { makePostgresWebhookEventFailureStore } from '../foundations/adapters/postgres/webhook-event-failure-store/webhook-event-failure-store.repo.ts';
import { makePostgresWebhookInboxQueueStore } from '../foundations/adapters/postgres/webhook-inbox-queue-store/webhook-inbox-queue-store.repo.ts';
import { makePostgresWebhookReceiptQuarantineStore } from '../foundations/adapters/postgres/webhook-receipt-quarantine-store/webhook-receipt-quarantine-store.repo.ts';

export type WebhookIngestionApplicationDeps = Readonly<{
  db: Database;
  clock: Clock;
  ids: IdSource;
  quarantineRetentionMs?: number;
}>;

export const makePostgresWebhookIngestionApplication = (
  deps: WebhookIngestionApplicationDeps,
) => {
  const inboxQueueStore = makePostgresWebhookInboxQueueStore(deps.db);
  const completionRepo = makeCompleteWebhookEventRepository(deps.db);
  const eventFailureStore = makePostgresWebhookEventFailureStore(deps.db);
  const deadEventStore = makePostgresDeadWebhookEventStore(deps.db);
  const sourceLocationBindingStore = makePostgresSourceLocationBindingStore(
    deps.db,
  );
  const quarantineStore = makePostgresWebhookReceiptQuarantineStore(deps.db);
  const quarantineRetentionMs =
    deps.quarantineRetentionMs ?? DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS;

  return {
    ingestEvent: makeIngestWebhookEvent({
      repo: makeIngestWebhookEventRepository(deps),
      clock: deps.clock,
    }),
    captureReceipt: makeCaptureWebhookReceipt({
      store: quarantineStore,
      clock: deps.clock,
      ids: deps.ids,
      retentionMs: quarantineRetentionMs,
    }),
    linkReceipt: makeLinkWebhookReceipt({
      store: quarantineStore,
      clock: deps.clock,
    }),
    purgeExpiredReceipts: makePurgeExpiredWebhookReceipts({
      store: quarantineStore,
      clock: deps.clock,
    }),
    measureBacklog: makeMeasureWebhookBacklog({
      store: inboxQueueStore,
      clock: deps.clock,
    }),
    claimEvents: makeClaimWebhookEvents({
      store: inboxQueueStore,
      clock: deps.clock,
    }),
    completeEvent: makeCompleteWebhookEvent({
      repo: completionRepo,
      clock: deps.clock,
    }),
    retryEvent: makeRetryWebhookEvent(eventFailureStore),
    deadLetterEvent: makeDeadLetterWebhookEvent(eventFailureStore),
    listDeadEvents: makeListDeadWebhookEvents({
      store: deadEventStore,
      clock: deps.clock,
    }),
    replayDeadEvent: makeReplayDeadWebhookEvent({
      store: deadEventStore,
      clock: deps.clock,
    }),
    resolveSourceLocation: makeResolveSourceLocation(
      sourceLocationBindingStore,
    ),
    manageSourceLocationBindings: makeReconcileSourceLocationBindings({
      store: sourceLocationBindingStore,
      clock: deps.clock,
    }),
  };
};

export type WebhookIngestionApplication = ReturnType<
  typeof makePostgresWebhookIngestionApplication
>;
