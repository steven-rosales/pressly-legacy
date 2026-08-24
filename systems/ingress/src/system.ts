import type { PostgresDatabase } from '@pressly/postgres/client';
import { makeReconcileSourceLocationBindingsCell } from './cells/bindings/reconcile-source-location-bindings/cell.ts';
import { makeReconcileSourceLocationBindingsPostgresRepository } from './cells/bindings/reconcile-source-location-bindings/postgres.ts';
import { makeResolveSourceLocationCell } from './cells/bindings/resolve-source-location/cell.ts';
import { makeResolveSourceLocationPostgresRepository } from './cells/bindings/resolve-source-location/postgres.ts';
import { makeClaimEventsCell } from './cells/inbox/claim-events/cell.ts';
import { makeClaimEventsPostgresRepository } from './cells/inbox/claim-events/postgres.ts';
import { makeCompleteEventCell } from './cells/inbox/complete-event/cell.ts';
import { makeCompleteEventPostgresRepository } from './cells/inbox/complete-event/postgres.ts';
import { makeDeadLetterEventCell } from './cells/inbox/dead-letter-event/cell.ts';
import { makeDeadLetterEventPostgresRepository } from './cells/inbox/dead-letter-event/postgres.ts';
import { makeIngestEventCell } from './cells/inbox/ingest-event/cell.ts';
import { makeIngestEventPostgresRepository } from './cells/inbox/ingest-event/postgres.ts';
import { makeListDeadEventsCell } from './cells/inbox/list-dead-events/cell.ts';
import { makeListDeadEventsPostgresRepository } from './cells/inbox/list-dead-events/postgres.ts';
import { makeMeasureWebhookBacklogCell } from './cells/inbox/measure-webhook-backlog/cell.ts';
import { makeMeasureWebhookBacklogPostgresRepository } from './cells/inbox/measure-webhook-backlog/postgres.ts';
import { makeReplayDeadEventCell } from './cells/inbox/replay-dead-event/cell.ts';
import { makeReplayDeadEventPostgresRepository } from './cells/inbox/replay-dead-event/postgres.ts';
import { makeRetryEventCell } from './cells/inbox/retry-event/cell.ts';
import { makeRetryEventPostgresRepository } from './cells/inbox/retry-event/postgres.ts';
import { makeCaptureWebhookReceiptCell } from './cells/quarantine/capture-webhook-receipt/cell.ts';
import { makeCaptureWebhookReceiptPostgresRepository } from './cells/quarantine/capture-webhook-receipt/postgres.ts';
import { makeLinkWebhookReceiptCell } from './cells/quarantine/link-webhook-receipt/cell.ts';
import { makeLinkWebhookReceiptPostgresRepository } from './cells/quarantine/link-webhook-receipt/postgres.ts';
import { makePurgeExpiredWebhookReceiptsCell } from './cells/quarantine/purge-expired-webhook-receipts/cell.ts';
import { makePurgeExpiredWebhookReceiptsPostgresRepository } from './cells/quarantine/purge-expired-webhook-receipts/postgres.ts';
import { makeProcessInboundEventCell } from './cells/processing/process-inbound-event/cell.ts';
import type { ProcessInboundEventDependencies } from './cells/processing/process-inbound-event/types.ts';
import { makeReceiveCentsWebhookCell } from './cells/sources/receive-cents-webhook/cell.ts';
import type { CentsWebhookPayloadCipher } from './sources/cents/public.ts';
import { defaultWebhookQuarantineRetentionMs } from './model/quarantine.ts';
import type { IngressSchema } from './schema/ingress.ts';

export type IngressSystemClock = Readonly<{ now: () => Date }>;
export type IngressSystemIdSource = Readonly<{ next: () => string }>;

export type IngressStateSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: IngressSchema;
  clock: IngressSystemClock;
  ids: IngressSystemIdSource;
  quarantineRetentionMs?: number;
  cents?: Readonly<{ payloadCipher?: CentsWebhookPayloadCipher }>;
}>;

export const makeIngressStateSystem = (
  deps: IngressStateSystemDependencies,
) => {
  const quarantineRetentionMs =
    deps.quarantineRetentionMs ?? defaultWebhookQuarantineRetentionMs;
  const captureWebhookReceipt = makeCaptureWebhookReceiptCell({
    repo: makeCaptureWebhookReceiptPostgresRepository(deps.db, deps.schema),
    clock: deps.clock,
    ids: deps.ids,
    retentionMs: quarantineRetentionMs,
  });
  const ingestEvent = makeIngestEventCell({
    repo: makeIngestEventPostgresRepository({
      db: deps.db,
      schema: deps.schema,
      ids: deps.ids,
    }),
    clock: deps.clock,
  });
  const linkWebhookReceipt = makeLinkWebhookReceiptCell({
    repo: makeLinkWebhookReceiptPostgresRepository(deps.db, deps.schema),
    clock: deps.clock,
  });
  return Object.freeze({
    cells: Object.freeze({
      captureWebhookReceipt,
      claimEvents: makeClaimEventsCell({
        repo: makeClaimEventsPostgresRepository(deps.db, deps.schema),
        clock: deps.clock,
      }),
      completeEvent: makeCompleteEventCell({
        repo: makeCompleteEventPostgresRepository(deps.db, deps.schema),
        clock: deps.clock,
      }),
      deadLetterEvent: makeDeadLetterEventCell(
        makeDeadLetterEventPostgresRepository(deps.db, deps.schema),
      ),
      ingestEvent,
      linkWebhookReceipt,
      listDeadEvents: makeListDeadEventsCell({
        repo: makeListDeadEventsPostgresRepository(deps.db, deps.schema),
        clock: deps.clock,
      }),
      measureWebhookBacklog: makeMeasureWebhookBacklogCell({
        repo: makeMeasureWebhookBacklogPostgresRepository(deps.db, deps.schema),
        clock: deps.clock,
      }),
      purgeExpiredWebhookReceipts: makePurgeExpiredWebhookReceiptsCell({
        repo: makePurgeExpiredWebhookReceiptsPostgresRepository(
          deps.db,
          deps.schema,
        ),
        clock: deps.clock,
      }),
      reconcileSourceLocationBindings: makeReconcileSourceLocationBindingsCell({
        repo: makeReconcileSourceLocationBindingsPostgresRepository(
          deps.db,
          deps.schema,
        ),
        clock: deps.clock,
      }),
      replayDeadEvent: makeReplayDeadEventCell({
        repo: makeReplayDeadEventPostgresRepository(deps.db, deps.schema),
        clock: deps.clock,
      }),
      resolveSourceLocation: makeResolveSourceLocationCell(
        makeResolveSourceLocationPostgresRepository(deps.db, deps.schema),
      ),
      retryEvent: makeRetryEventCell(
        makeRetryEventPostgresRepository(deps.db, deps.schema),
      ),
      receiveCentsWebhook: makeReceiveCentsWebhookCell({
        ingestEvent: (command) => ingestEvent.execute(command),
        ...(deps.cents?.payloadCipher === undefined
          ? {}
          : {
              captureReceipt: (command) =>
                captureWebhookReceipt.execute(command),
              linkReceipt: (command) => linkWebhookReceipt.execute(command),
              payloadCipher: deps.cents.payloadCipher,
            }),
      }),
    }),
  });
};

export type IngressStateSystem = ReturnType<typeof makeIngressStateSystem>;

export type IngressSystemDependencies = IngressStateSystemDependencies &
  Readonly<{
    processInboundEvent: Omit<
      ProcessInboundEventDependencies,
      'resolveSourceLocation'
    >;
  }>;

export const makeIngressSystem = (deps: IngressSystemDependencies) => {
  const state = makeIngressStateSystem(deps);
  return Object.freeze({
    cells: Object.freeze({
      ...state.cells,
      processInboundEvent: makeProcessInboundEventCell({
        ...deps.processInboundEvent,
        resolveSourceLocation: (query) =>
          state.cells.resolveSourceLocation.execute(query),
      }),
    }),
  });
};

export type IngressSystem = ReturnType<typeof makeIngressSystem>;
