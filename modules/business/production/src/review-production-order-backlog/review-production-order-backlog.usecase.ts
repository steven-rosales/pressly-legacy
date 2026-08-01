import { createHash } from 'node:crypto';
import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogClassificationReason,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogPreview,
  ProductionOrderBacklogPreviewItem,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import { assessProductionOrderResolution } from '../production-policy/production-order-resolution.policy.ts';
import type {
  ClockPort,
  IdPort,
  WorkEventCommandIdentity,
} from '../command-execution/production-command.port.ts';
import type { ProductionOrderResolutionLifecycleDecision } from '../production-lifecycle/production-lifecycle.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  BacklogSnapshotScope,
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
  ReviewProductionOrderBacklogRepository,
} from './review-production-order-backlog.port.ts';
export type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
} from './review-production-order-backlog.port.ts';

type ClassifiedOrder = Readonly<{
  snapshot: ProductionOrderBacklogSnapshotOrder;
  item: ProductionOrderBacklogPreviewItem;
  lifecycle: ProductionOrderResolutionLifecycleDecision | null;
}>;

type ClassifiedSnapshot = Readonly<{
  orders: readonly ClassifiedOrder[];
  hasMore: boolean;
}>;

type BacklogCursorPayload = Readonly<{
  version: 1;
  locationId: string;
  filter: string;
  cutoff: string;
  reason: string;
  dueAt: string;
  orderId: string;
}>;

class InvalidBacklogCursor extends Error {}

const cursorChecksum = (encodedPayload: string): string =>
  createHash('sha256')
    .update(`pressly:production-order-backlog-cursor:v1\0${encodedPayload}`)
    .digest('hex');

const encodeBacklogCursor = (
  command: {
    locationId: string;
    filter: string;
    cutoff: string;
    reason: string;
  },
  order: Pick<ProductionOrderBacklogSnapshotOrder, 'dueAt' | 'orderId'>,
): ProductionOrderBacklogCursor => {
  const payload: BacklogCursorPayload = {
    version: 1,
    locationId: command.locationId,
    filter: command.filter,
    cutoff: command.cutoff,
    reason: command.reason,
    dueAt: order.dueAt.toISOString(),
    orderId: order.orderId,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  return `${encoded}.${cursorChecksum(encoded)}` as ProductionOrderBacklogCursor;
};

const parseBacklogCursor = (command: {
  locationId: string;
  filter: string;
  cutoff: string;
  reason: string;
  cursor: ProductionOrderBacklogCursor | null;
}): BacklogSnapshotScope['after'] => {
  if (command.cursor === null) return null;

  const parts = command.cursor.split('.');
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[1] !== cursorChecksum(parts[0])
  )
    throw new InvalidBacklogCursor('The backlog cursor is invalid.');

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new InvalidBacklogCursor('The backlog cursor is invalid.');
  }
  if (payload === null || typeof payload !== 'object')
    throw new InvalidBacklogCursor('The backlog cursor is invalid.');

  const value = payload as Partial<BacklogCursorPayload>;
  if (
    value.version !== 1 ||
    value.locationId !== command.locationId ||
    value.filter !== command.filter ||
    value.cutoff !== command.cutoff ||
    value.reason !== command.reason
  )
    throw new InvalidBacklogCursor(
      'The backlog cursor does not belong to this review scope.',
    );
  if (
    typeof value.dueAt !== 'string' ||
    Number.isNaN(Date.parse(value.dueAt)) ||
    new Date(value.dueAt).toISOString() !== value.dueAt ||
    typeof value.orderId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.orderId,
    )
  )
    throw new InvalidBacklogCursor('The backlog cursor is invalid.');

  return { dueAt: new Date(value.dueAt), orderId: value.orderId };
};

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);

  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
};

const snapshotHashPayload = (
  input: {
    locationId: string;
    filter: string;
    cutoff: string;
    reason: string;
    maxOrders: number;
    cursor: ProductionOrderBacklogCursor | null;
  },
  classified: ClassifiedSnapshot,
) => ({
  version: 2,
  locationId: input.locationId,
  filter: input.filter,
  cutoff: input.cutoff,
  reason: input.reason,
  maxOrders: input.maxOrders,
  cursor: input.cursor,
  hasMore: classified.hasMore,
  candidates: [...classified.orders]
    .sort((left, right) =>
      left.snapshot.orderId.localeCompare(right.snapshot.orderId),
    )
    .map(({ snapshot, item }) => ({
      orderId: snapshot.orderId,
      // Production order version is the aggregate concurrency token for both
      // ordinary order facts and the orthogonal resolution projection.
      orderVersion: snapshot.productionVersion,
      resolutionState: snapshot.resolutionState,
      executionStatus: snapshot.executionStatus,
      operationalStatus: snapshot.operationalStatus,
      dueAt: snapshot.dueAt.toISOString(),
      guardFacts: {
        hasIntake: snapshot.hasIntake,
        hasManualAdmission: snapshot.hasManualAdmission,
        isPriority: snapshot.isPriority,
        hasPendingPlacement: snapshot.hasPendingPlacement,
        hasShiftSelection: snapshot.hasShiftSelection,
        hasBatchMembership: snapshot.hasBatchMembership,
        hasStageAttempt: snapshot.hasStageAttempt,
        hasRoute: snapshot.hasRoute,
      },
      classification: item.category,
      reasons: [...item.reasons].sort(),
    })),
});

export const hashProductionOrderBacklogPreview = (
  input: {
    locationId: string;
    filter: string;
    cutoff: string;
    reason: string;
    maxOrders: number;
    cursor: ProductionOrderBacklogCursor | null;
  },
  classified: ClassifiedSnapshot,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(canonicalize(snapshotHashPayload(input, classified))),
    )
    .digest('hex');

const item = (
  order: ProductionOrderBacklogSnapshotOrder,
  category: ProductionOrderBacklogPreviewItem['category'],
  reasons: readonly ProductionOrderBacklogClassificationReason[],
): ProductionOrderBacklogPreviewItem => ({
  orderId: order.orderId,
  displayReference: order.displayReference,
  dueAt: order.dueAt.toISOString(),
  category,
  reasons: [...reasons],
  expectedVersion: order.productionVersion,
  expectedResolutionState: order.resolutionState,
});

const classifyOrder = (
  policy: ProductionPolicyPort,
  order: ProductionOrderBacklogSnapshotOrder,
): ClassifiedOrder => {
  const assessment = assessProductionOrderResolution(policy, {
    resolutionState: order.resolutionState,
    executionStatus: order.executionStatus,
    operationalStatus: order.operationalStatus,
    expectedVersion: order.productionVersion,
    hasShiftSelection: order.hasShiftSelection,
    hasBatchMembership: order.hasBatchMembership,
    hasStageAttempt: order.hasStageAttempt,
    hasRoute: order.hasRoute,
    hasIntake: order.hasIntake,
    hasManualAdmission: order.hasManualAdmission,
    isPriority: order.isPriority,
    hasPendingPlacement: order.hasPendingPlacement,
  });

  if (assessment.status === 'already_historical')
    return {
      snapshot: order,
      item: item(order, 'already_historical', [assessment.reason]),
      lifecycle: null,
    };
  if (assessment.status === 'blocked')
    return {
      snapshot: order,
      item: item(order, 'kept_for_safety', assessment.reasons),
      lifecycle: null,
    };
  if (assessment.requiresExplicitReview)
    return {
      snapshot: order,
      item: item(order, 'review_individually', assessment.reviewReasons),
      lifecycle: null,
    };

  return {
    snapshot: order,
    item: item(order, 'ready_to_archive', ['no_operator_owned_facts']),
    lifecycle: assessment.lifecycle,
  };
};

export const classifyProductionOrderBacklogSnapshot = (
  policy: ProductionPolicyPort,
  snapshot: ProductionOrderBacklogSnapshot,
): ClassifiedSnapshot => ({
  orders: snapshot.orders.map((order) => classifyOrder(policy, order)),
  hasMore: snapshot.hasMore,
});

const scope = (command: {
  locationId: string;
  filter: BacklogSnapshotScope['filter'];
  cutoff: string;
  reason: string;
  maxOrders: number;
  cursor: ProductionOrderBacklogCursor | null;
}): BacklogSnapshotScope => ({
  locationId: command.locationId,
  filter: command.filter,
  cutoff: new Date(command.cutoff),
  maxOrders: command.maxOrders,
  after: parseBacklogCursor(command),
});

const nextCursorFor = (
  command: {
    locationId: string;
    filter: string;
    cutoff: string;
    reason: string;
  },
  classified: ClassifiedSnapshot,
): ProductionOrderBacklogCursor | null => {
  const lastOrder = classified.orders.at(-1)?.snapshot;
  return classified.hasMore && lastOrder !== undefined
    ? encodeBacklogCursor(command, lastOrder)
    : null;
};

const previewFromSnapshot = (
  command: {
    locationId: string;
    filter: BacklogSnapshotScope['filter'];
    cutoff: string;
    reason: string;
    maxOrders: number;
    cursor: ProductionOrderBacklogCursor | null;
  },
  classified: ClassifiedSnapshot,
  generatedAt: Date,
): ProductionOrderBacklogPreview => {
  const nextCursor = nextCursorFor(command, classified);
  const groups = {
    readyToArchive: classified.orders
      .filter(({ item }) => item.category === 'ready_to_archive')
      .map(({ item }) => item),
    reviewIndividually: classified.orders
      .filter(({ item }) => item.category === 'review_individually')
      .map(({ item }) => item),
    keptForSafety: classified.orders
      .filter(({ item }) => item.category === 'kept_for_safety')
      .map(({ item }) => item),
    alreadyHistorical: classified.orders
      .filter(({ item }) => item.category === 'already_historical')
      .map(({ item }) => item),
  };

  return {
    locationId: command.locationId,
    filter: command.filter,
    cutoff: command.cutoff,
    reason: command.reason as ProductionOrderBacklogPreview['reason'],
    maxOrders: command.maxOrders,
    candidateCount: classified.orders.length,
    hasMore: classified.hasMore,
    cursor: command.cursor,
    nextCursor,
    previewHash: hashProductionOrderBacklogPreview(command, classified),
    generatedAt: generatedAt.toISOString(),
    groups,
  };
};

export const makePreviewProductionOrderBacklog =
  (deps: {
    repo: ReviewProductionOrderBacklogRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
  }): PreviewProductionOrderBacklog =>
  async (command) => {
    try {
      const snapshot = await deps.repo.loadSnapshot(scope(command));
      return result.ok(
        previewFromSnapshot(
          command,
          classifyProductionOrderBacklogSnapshot(deps.policy, snapshot),
          deps.clock.now(),
        ),
      );
    } catch (error) {
      if (error instanceof InvalidBacklogCursor)
        return result.err(
          productionError(
            'PRODUCTION_ORDER_BACKLOG_CURSOR_INVALID',
            error.message,
            400,
          ),
        );
      return result.err(
        productionError(
          'PRODUCTION_ORDER_BACKLOG_PREVIEW_FAILED',
          'The old-order review could not be prepared.',
          500,
          error,
        ),
      );
    }
  };

class BulkResolutionAbort extends Error {
  public constructor(public readonly appError: AppError) {
    super(appError.safeMessage);
  }
}

const perOrderIdempotencyKey = (commandKey: string, orderId: string): string =>
  `bulk-order:${createHash('sha256')
    .update(`${commandKey}\0${orderId}`)
    .digest('hex')}`;

const perOrderCommandIdentity = (input: {
  command: CommitProductionOrderBacklogCommand & Readonly<{ actorId: string }>;
  orderId: string;
  expectedVersion: number;
  bulkOperationId: string;
}): WorkEventCommandIdentity =>
  defineWorkEventCommand({
    operation: 'production_order_bulk_resolved_without_production',
    locationId: input.command.locationId,
    actorId: input.command.actorId,
    entityType: 'production_order',
    entityId: input.orderId,
    expectedVersion: input.expectedVersion,
    payload: {
      bulkOperationId: input.bulkOperationId,
      previewHash: input.command.previewHash,
      reason: input.command.reason,
    },
  });

export const makeCommitProductionOrderBacklog =
  (deps: {
    repo: ReviewProductionOrderBacklogRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
    ids: IdPort;
  }): CommitProductionOrderBacklog =>
  async (command) => {
    const idempotency = defineWorkEventCommand({
      operation: 'production_order_backlog_bulk_resolution',
      locationId: command.locationId,
      actorId: command.actorId,
      entityType: 'production_order_bulk_resolution',
      expectedVersion: null,
      payload: {
        filter: command.filter,
        cutoff: command.cutoff,
        reason: command.reason,
        note: command.note,
        maxOrders: command.maxOrders,
        cursor: command.cursor,
        previewHash: command.previewHash,
      },
    });

    try {
      return await deps.repo.transaction(async (repo) => {
        const replay =
          resolveWorkEventReplay<ProductionOrderBacklogCommitResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock =
          resolveWorkEventReplay<ProductionOrderBacklogCommitResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);

        const snapshot = await repo.loadSnapshotForUpdate(scope(command));
        const classified = classifyProductionOrderBacklogSnapshot(
          deps.policy,
          snapshot,
        );
        const actualHash = hashProductionOrderBacklogPreview(
          command,
          classified,
        );
        if (actualHash !== command.previewHash)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_BACKLOG_PREVIEW_STALE',
              'The old-order backlog changed after it was reviewed. Refresh the preview before committing.',
              409,
            ),
          );

        const ready = classified.orders.filter(
          (
            order,
          ): order is ClassifiedOrder & {
            lifecycle: ProductionOrderResolutionLifecycleDecision;
          } =>
            order.item.category === 'ready_to_archive' &&
            order.lifecycle !== null,
        );
        const bulkOperationId = deps.ids.next();
        const now = deps.clock.now();
        const resolved: ProductionOrderBacklogCommitResult['resolved'][number][] =
          [];

        for (const candidate of ready) {
          const changed = await repo.resolveOrder({
            locationId: command.locationId,
            orderId: candidate.snapshot.orderId,
            actorId: command.actorId,
            expectedVersion: candidate.snapshot.productionVersion,
            lifecycle: candidate.lifecycle,
            reason: command.reason,
            note: command.note,
            bulkOperationId,
            now,
          });
          if (changed === null)
            throw new BulkResolutionAbort(
              productionError(
                'PRODUCTION_ORDER_BACKLOG_COMMIT_CONFLICT',
                'An order changed while the old-order backlog was being committed. No orders were archived.',
                409,
              ),
            );

          resolved.push(changed);
          const orderIdentity = perOrderCommandIdentity({
            command,
            orderId: changed.orderId,
            expectedVersion: candidate.snapshot.productionVersion,
            bulkOperationId,
          });
          await repo.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'production_order_bulk_resolved_without_production',
            entityType: 'production_order',
            entityId: changed.orderId,
            actorId: command.actorId,
            expectedVersion: candidate.snapshot.productionVersion,
            idempotencyKey: perOrderIdempotencyKey(
              command.idempotencyKey,
              changed.orderId,
            ),
            payload: {
              bulkOperationId,
              previewHash: command.previewHash,
              from: candidate.lifecycle.from,
              resolutionState: changed.resolutionState,
              reason: command.reason,
              version: changed.version,
            },
            idempotency: {
              command: orderIdentity,
              result: {
                bulkOperationId,
                orderId: changed.orderId,
                resolutionState: changed.resolutionState,
                version: changed.version,
              },
            },
          });
        }

        const committed: ProductionOrderBacklogCommitResult = {
          locationId: command.locationId,
          bulkOperationId,
          previewHash: command.previewHash,
          nextCursor: nextCursorFor(command, classified),
          resolvedCount: resolved.length,
          resolved,
          committedAt: now.toISOString(),
          replayed: false,
        };
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_backlog_bulk_resolution_committed',
          entityType: 'production_order_bulk_resolution',
          entityId: bulkOperationId,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: {
            bulkOperationId,
            previewHash: command.previewHash,
            reason: command.reason,
            cursor: command.cursor,
            nextCursor: committed.nextCursor,
            candidateCount: classified.orders.length,
            resolvedCount: resolved.length,
          },
          idempotency: { command: idempotency, result: committed },
        });

        return result.ok(committed);
      });
    } catch (error) {
      if (error instanceof BulkResolutionAbort)
        return result.err(error.appError);
      if (error instanceof InvalidBacklogCursor)
        return result.err(
          productionError(
            'PRODUCTION_ORDER_BACKLOG_CURSOR_INVALID',
            error.message,
            400,
          ),
        );
      return result.err(
        productionError(
          'PRODUCTION_ORDER_BACKLOG_COMMIT_FAILED',
          'The old-order backlog could not be archived.',
          500,
          error,
        ),
      );
    }
  };
