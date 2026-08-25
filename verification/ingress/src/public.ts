import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { makeIngressStateSystem } from '@pressly/ingress-system/testing/assembly';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '@pressly/ingress-system/models/quarantine';
import type {
  ClaimEventsCommand,
  ClaimEventsResult,
} from '@pressly/ingress-system/operations/inbox/claim-events/types';
import type { DeadLetterEventCommand } from '@pressly/ingress-system/operations/inbox/dead-letter-event/types';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
  ReplayDeadWebhookEventResult,
  WebhookBacklog,
  WebhookEventClaim,
  WebhookEventCompletion,
} from '@pressly/ingress-system/models/inbox';
import type {
  LinkWebhookReceiptCommand,
  LinkWebhookReceiptResult,
} from '@pressly/ingress-system/operations/quarantine/link-webhook-receipt/types';
import type { ReconcileSourceLocationBindingsCommand } from '@pressly/ingress-system/operations/bindings/reconcile-source-location-bindings/types';
import type { ReconcileSourceLocationBindingsResult } from '@pressly/ingress-system/capabilities/source-location-bindings-v1';
import type { ReplayDeadEventCommand } from '@pressly/ingress-system/operations/inbox/replay-dead-event/types';
import type { ResolveSourceLocationInput } from '@pressly/ingress-system/operations/bindings/resolve-source-location/types';
import type { RetryEventCommand } from '@pressly/ingress-system/operations/inbox/retry-event/types';

export const ingressVerificationOperationCount = 15 as const;

type Ok<Value> = Readonly<{ tag: 'ok'; value: Value }>;
type Err<Failure> = Readonly<{ tag: 'err'; error: Failure }>;
type CellOutcome<Value, Failure> =
  | Readonly<{ kind: 'success'; value: Value }>
  | Readonly<{ kind: 'failure'; failure: Failure }>;
type PublicFailure = Readonly<{ code: string; message: string }>;

const cellValue = <Value>(outcome: CellOutcome<Value, never>): Value => {
  if (outcome.kind === 'success') return outcome.value;
  throw outcome.failure;
};

const cellOk = <Value>(outcome: CellOutcome<Value, never>): Ok<Value> => ({
  tag: 'ok',
  value: cellValue(outcome),
});

const cellResult = <Value, Failure extends PublicFailure>(
  outcome: CellOutcome<Value, Failure>,
): Ok<Value> | Err<PublicFailure> =>
  outcome.kind === 'success'
    ? { tag: 'ok', value: outcome.value }
    : {
        tag: 'err',
        error: {
          code: outcome.failure.code,
          message: outcome.failure.message,
        },
      };

export type IngressRunner = Readonly<{
  ingestEvent: (
    command: IngestWebhookEventCommand,
  ) => Promise<Ok<IngestWebhookEventResult>>;
  claimEvents: (command: ClaimEventsCommand) => Promise<ClaimEventsResult>;
  measureBacklog: () => Promise<WebhookBacklog>;
  completeEvent: (
    command: WebhookEventClaim,
  ) => Promise<WebhookEventCompletion>;
  retryEvent: (command: RetryEventCommand) => Promise<WebhookEventCompletion>;
  deadLetterEvent: (
    command: DeadLetterEventCommand,
  ) => Promise<WebhookEventCompletion>;
  listDeadEvents: (
    query: ListDeadWebhookEventsQuery,
  ) => Promise<Ok<DeadWebhookEventsResult>>;
  replayDeadEvent: (
    command: ReplayDeadEventCommand,
  ) => Promise<Ok<ReplayDeadWebhookEventResult> | Err<PublicFailure>>;
  captureReceipt: (
    command: CaptureWebhookReceiptCommand,
  ) => Promise<Ok<CaptureWebhookReceiptResult>>;
  linkReceipt: (
    command: LinkWebhookReceiptCommand,
  ) => Promise<Ok<LinkWebhookReceiptResult> | Err<PublicFailure>>;
  purgeExpiredReceipts: () => Promise<Ok<Readonly<{ purgedCount: number }>>>;
  resolveSourceLocation: (
    query: ResolveSourceLocationInput,
  ) => Promise<string | null>;
  reconcileSourceLocationBindings: (
    command: ReconcileSourceLocationBindingsCommand,
  ) => Promise<Ok<ReconcileSourceLocationBindingsResult>>;
}>;

export type IngressRunnerDependencies = Readonly<{
  db: PostgresDatabase;
  clock: Readonly<{ now: () => Date }>;
  ids: Readonly<{ next: () => string }>;
  quarantineRetentionMs?: number;
}>;

export const makeIngressRunner = (
  deps: IngressRunnerDependencies,
): IngressRunner => {
  const cells = makeIngressStateSystem({
    ...deps,
    schema: presslyPostgresOwnerSchemas.ingress,
  }).cells;
  return Object.freeze({
    ingestEvent: async (command) =>
      cellOk(await cells.ingestEvent.execute(command)),
    claimEvents: async (command) =>
      cellValue(await cells.claimEvents.execute(command)),
    measureBacklog: async () =>
      cellValue(await cells.measureWebhookBacklog.execute({})),
    completeEvent: async (command) =>
      cellValue(await cells.completeEvent.execute(command)),
    retryEvent: async (command) =>
      cellValue(await cells.retryEvent.execute(command)),
    deadLetterEvent: async (command) =>
      cellValue(await cells.deadLetterEvent.execute(command)),
    listDeadEvents: async (query) =>
      cellOk(await cells.listDeadEvents.execute(query)),
    replayDeadEvent: async (command) =>
      cellResult(await cells.replayDeadEvent.execute(command)),
    captureReceipt: async (command) =>
      cellOk(await cells.captureWebhookReceipt.execute(command)),
    linkReceipt: async (command) =>
      cellResult(await cells.linkWebhookReceipt.execute(command)),
    purgeExpiredReceipts: async () =>
      cellOk(await cells.purgeExpiredWebhookReceipts.execute({})),
    resolveSourceLocation: async (query) =>
      cellValue(await cells.resolveSourceLocation.execute(query)),
    reconcileSourceLocationBindings: async (command) =>
      cellOk(await cells.reconcileSourceLocationBindings.execute(command)),
  });
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const observeIngress = async (db: PostgresDatabase) => {
  const [events, receipts, bindings] = await Promise.all([
    db
      .select()
      .from(presslyPostgresOwnerSchemas.ingress.webhookEvents)
      .orderBy(asc(presslyPostgresOwnerSchemas.ingress.webhookEvents.id)),
    db
      .select()
      .from(presslyPostgresOwnerSchemas.ingress.webhookReceiptQuarantine)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.ingress.webhookReceiptQuarantine.id),
      ),
    db
      .select()
      .from(presslyPostgresOwnerSchemas.ingress.sourceLocationBindings)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.ingress.sourceLocationBindings.source),
        asc(
          presslyPostgresOwnerSchemas.ingress.sourceLocationBindings
            .externalLocationId,
        ),
      ),
  ]);
  return Object.freeze({
    events: events.map((event) => ({
      ...event,
      sourceOccurredAt: iso(event.sourceOccurredAt),
      availableAt: event.availableAt.toISOString(),
      leaseExpiresAt: iso(event.leaseExpiresAt),
      receivedAt: event.receivedAt.toISOString(),
      processedAt: iso(event.processedAt),
    })),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      receivedAt: receipt.receivedAt.toISOString(),
      expiresAt: receipt.expiresAt.toISOString(),
      linkedAt: iso(receipt.linkedAt),
    })),
    bindings: bindings.map((binding) => ({
      ...binding,
      createdAt: binding.createdAt.toISOString(),
      updatedAt: binding.updatedAt.toISOString(),
    })),
  });
};
