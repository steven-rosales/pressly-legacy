import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionBatchLifecycleState } from '../../../model/public.ts';
import { completeReconciledStageAttempts } from './attempts.postgres.ts';
import type {
  ReconcileBatchProgressRepository,
  ReconcileBatchProgressTransactionRepository,
} from './execute.ts';
import type { StoredReconcileBatchProgressWorkEvent } from './idempotency.ts';
import { completeReconciledBatch } from './terminal.postgres.ts';
import type {
  ReconcileBatchProgressExpectedFailure,
  ReconciliationContext,
  ReconciliationStage,
} from './types.ts';
import {
  appendReconcileBatchProgressWorkEvent,
  findReconcileBatchProgressWorkEvent,
} from './work-event.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });
const conflict = (
  code: string,
  message: string,
): ReconcileBatchProgressExpectedFailure => ({
  kind: 'conflict',
  code,
  message,
  safeMessage: 'Production state changed. Refresh and try again.',
});

const stageKind = (value: string): ReconciliationStage['stage'] => {
  if (
    value === 'sorting' ||
    value === 'washing' ||
    value === 'drying' ||
    value === 'folding_packaging'
  )
    return value;
  throw invariant(
    'production_reconciliation_stage_kind_invalid',
    `Unknown production stage kind: ${value}.`,
  );
};
const stageStatus = (value: string): ReconciliationStage['status'] => {
  if (value === 'planned' || value === 'started' || value === 'completed')
    return value;
  throw invariant(
    'production_reconciliation_stage_status_invalid',
    `Unknown production stage status: ${value}.`,
  );
};
const attemptStatus = (
  value: string,
): ReconciliationContext['attempts'][number]['status'] => {
  if (value === 'assigned' || value === 'completed' || value === 'released')
    return value;
  throw invariant(
    'production_reconciliation_attempt_status_invalid',
    `Unknown order-stage attempt status: ${value}.`,
  );
};
const batchStatus = (value: string): ProductionBatchLifecycleState => {
  if (
    value === 'queued' ||
    value === 'sorting' ||
    value === 'washing' ||
    value === 'drying' ||
    value === 'folding_packaging' ||
    value === 'finished'
  )
    return value;
  throw invariant(
    'production_reconciliation_batch_status_invalid',
    `Unknown production batch status: ${value}.`,
  );
};

const loadContext = async (
  db: PostgresExecutor,
  locationId: string,
  productionRunId: string,
  productionBatchId: string,
  schema: ProductionSchema,
): Promise<ReconciliationContext | null> => {
  const [run] = await db
    .select()
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, locationId),
        eq(schema.productionRuns.id, productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (run === undefined) return null;
  const [batch] = await db
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, locationId),
        eq(schema.productionBatches.id, productionBatchId),
        eq(schema.productionBatches.productionRunId, productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (batch === undefined) return null;
  const [shift] = await db
    .select({ status: schema.productionShifts.status })
    .from(schema.productionShifts)
    .where(
      and(
        eq(schema.productionShifts.locationId, locationId),
        eq(schema.productionShifts.id, run.productionShiftId),
      ),
    )
    .limit(1);
  if (shift === undefined) return null;

  const stages = await db
    .select()
    .from(schema.stageRuns)
    .where(
      and(
        eq(schema.stageRuns.locationId, locationId),
        eq(schema.stageRuns.productionBatchId, productionBatchId),
      ),
    )
    .orderBy(asc(schema.stageRuns.plannedStartAt))
    .for('update');
  const stageIds = stages.map((stage) => stage.id);
  const attempts =
    stageIds.length === 0
      ? []
      : await db
          .select({
            id: schema.productionOrderStageAttempts.id,
            stageRunId: schema.productionOrderStageAttempts.stageRunId,
            status: schema.productionOrderStageAttempts.status,
          })
          .from(schema.productionOrderStageAttempts)
          .where(
            and(
              eq(schema.productionOrderStageAttempts.locationId, locationId),
              inArray(schema.productionOrderStageAttempts.stageRunId, stageIds),
            ),
          )
          .for('update');
  const memberships = await db
    .select({
      productionOrderId: schema.productionBatchOrders.productionOrderId,
    })
    .from(schema.productionBatchOrders)
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, locationId),
        eq(schema.productionBatchOrders.productionBatchId, productionBatchId),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .for('update');
  const orderIds = memberships.map((row) => row.productionOrderId);
  const orders =
    orderIds.length === 0
      ? []
      : await db
          .select({
            id: schema.productionOrders.id,
            status: schema.productionOrders.operationalStatus,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
            version: schema.productionOrders.version,
          })
          .from(schema.productionOrders)
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              inArray(schema.productionOrders.id, orderIds),
            ),
          )
          .for('update');

  const [activeStages, assignments, machines, stations, batches, runs] =
    await Promise.all([
      db
        .select({
          productionBatchId: schema.stageRuns.productionBatchId,
          stageKind: schema.stageRuns.stageKind,
        })
        .from(schema.stageRuns)
        .where(
          and(
            eq(schema.stageRuns.locationId, locationId),
            eq(schema.stageRuns.status, 'started'),
          ),
        ),
      db
        .select()
        .from(schema.stageMachineAssignments)
        .where(eq(schema.stageMachineAssignments.locationId, locationId)),
      db
        .select()
        .from(schema.machines)
        .where(eq(schema.machines.locationId, locationId)),
      db
        .select()
        .from(schema.stations)
        .where(eq(schema.stations.locationId, locationId)),
      db
        .select({
          id: schema.productionBatches.id,
          status: schema.productionBatches.status,
        })
        .from(schema.productionBatches)
        .where(
          and(
            eq(schema.productionBatches.locationId, locationId),
            eq(schema.productionBatches.productionRunId, productionRunId),
          ),
        ),
      db
        .select({
          id: schema.productionRuns.id,
          status: schema.productionRuns.status,
        })
        .from(schema.productionRuns)
        .where(
          and(
            eq(schema.productionRuns.locationId, locationId),
            eq(schema.productionRuns.productionShiftId, run.productionShiftId),
          ),
        ),
    ]);
  const stationKinds = new Map(
    stations.map((station) => [station.id, station.kind]),
  );
  const occupied = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.status === 'active' &&
          !stageIds.includes(assignment.stageRunId),
      )
      .map((assignment) => assignment.machineId),
  );
  return {
    run: {
      id: run.id,
      status: run.status,
      queueVersion: run.queueVersion,
      productionShiftId: run.productionShiftId,
      productionShiftStatus: shift.status,
    },
    batch: {
      id: batch.id,
      status: batchStatus(batch.status),
      version: batch.version,
      derivedWeightLbs: batch.derivedWeightLbs,
      membershipFrozen: batch.membershipFrozenAt !== null,
    },
    stages: stages.map((stage) => ({
      stageRunId: stage.id,
      stage: stageKind(stage.stageKind),
      status: stageStatus(stage.status),
      plannedStartAt: stage.plannedStartAt,
      plannedEndAt: stage.plannedEndAt,
      actualStartAt: stage.actualStartAt,
      actualEndAt: stage.actualEndAt,
      actualStartProvenance: stage.actualStartProvenance,
      actualEndProvenance: stage.actualEndProvenance,
      version: stage.version,
    })),
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      stageRunId: attempt.stageRunId,
      status: attemptStatus(attempt.status),
    })),
    activeOrders: orders,
    activeStageKinds: activeStages
      .filter((stage) => stage.productionBatchId !== productionBatchId)
      .map((stage) => stage.stageKind),
    machines: machines.flatMap((machine) =>
      machine.effectiveCapacityLbs === null
        ? []
        : [
            {
              id: machine.id,
              stationKind: stationKinds.get(machine.stationId) ?? 'unknown',
              effectiveCapacityLbs: machine.effectiveCapacityLbs,
              active: machine.isActive,
              overlaps: occupied.has(machine.id),
            },
          ],
    ),
    otherBatchStatuses: batches
      .filter((candidate) => candidate.id !== productionBatchId)
      .map((candidate) => candidate.status),
    otherRunStatuses: runs
      .filter((candidate) => candidate.id !== productionRunId)
      .map((candidate) => candidate.status),
  };
};

export type ReconcileBatchProgressPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeReconcileBatchProgressPostgresRepository = (
  deps: ReconcileBatchProgressPostgresDependencies,
  schema: ProductionSchema,
): ReconcileBatchProgressRepository<StoredReconcileBatchProgressWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ReconcileBatchProgressTransactionRepository<StoredReconcileBatchProgressWorkEvent> => ({
      findWorkEvent: (key) =>
        findReconcileBatchProgressWorkEvent(db, schema, key),
      loadContext: (locationId, runId, batchId) =>
        loadContext(db, locationId, runId, batchId, schema),
      reconcile: async ({ locationId, actorId, plan }) => {
        const nextVersions = new Map(
          plan.context.stages.map((stage) => [stage.stageRunId, stage.version]),
        );
        for (const transition of plan.stageLifecycles) {
          const current = plan.context.stages.find(
            (stage) => stage.stageRunId === transition.stageRunId,
          );
          if (current === undefined)
            throw invariant(
              'production_reconciliation_stage_context_missing',
              'Reconciliation stage context is incomplete.',
            );
          const [updated] = await db
            .update(schema.stageRuns)
            .set({
              status: transition.lifecycle.state,
              version: current.version + 1,
              updatedAt: plan.now,
              ...(transition.lifecycle.state === 'started'
                ? {
                    actualStartAt: null,
                    actualStartProvenance: 'not_recorded' as const,
                    startedBy: actorId,
                  }
                : {
                    actualEndAt: null,
                    actualEndProvenance: 'not_recorded' as const,
                    completedBy: actorId,
                    ...(transition.lifecycle.from === 'planned'
                      ? {
                          actualStartAt: null,
                          actualStartProvenance: 'not_recorded' as const,
                          startedBy: actorId,
                        }
                      : {}),
                  }),
            })
            .where(
              and(
                eq(schema.stageRuns.locationId, locationId),
                eq(schema.stageRuns.id, current.stageRunId),
                eq(schema.stageRuns.version, current.version),
                eq(schema.stageRuns.status, transition.lifecycle.from),
              ),
            )
            .returning({
              id: schema.stageRuns.id,
              version: schema.stageRuns.version,
            });
          if (updated === undefined)
            return {
              kind: 'failure',
              failure: conflict(
                'production_reconciliation_stage_version_conflict',
                'Production stage changed during reconciliation.',
              ),
            };
          nextVersions.set(updated.id, updated.version);

          if (transition.lifecycle.state === 'completed') {
            if (transition.lifecycle.from === 'planned')
              await db
                .delete(schema.stageMachineAssignments)
                .where(
                  and(
                    eq(schema.stageMachineAssignments.locationId, locationId),
                    eq(
                      schema.stageMachineAssignments.stageRunId,
                      current.stageRunId,
                    ),
                  ),
                );
            else
              await db
                .update(schema.stageMachineAssignments)
                .set({
                  status: 'completed',
                  actualEndAt: null,
                  updatedAt: plan.now,
                })
                .where(
                  and(
                    eq(schema.stageMachineAssignments.locationId, locationId),
                    eq(
                      schema.stageMachineAssignments.stageRunId,
                      current.stageRunId,
                    ),
                  ),
                );
            const attempts = await completeReconciledStageAttempts(
              db,
              {
                locationId,
                stageRunId: current.stageRunId,
                attempts: plan.attemptLifecycles.filter(
                  (attempt) => attempt.stageRunId === current.stageRunId,
                ),
                actorId,
                now: plan.now,
              },
              schema,
            );
            if (attempts.kind === 'failure') return attempts;
          }
        }

        if (
          plan.projection.activeStage === 'washing' ||
          plan.projection.activeStage === 'drying'
        ) {
          const target = plan.context.stages.find(
            (stage) => stage.stage === plan.projection.activeStage,
          );
          if (target === undefined)
            throw invariant(
              'production_reconciliation_active_stage_missing',
              'Active reconciliation stage was not found.',
            );
          await db
            .delete(schema.stageMachineAssignments)
            .where(
              and(
                eq(schema.stageMachineAssignments.locationId, locationId),
                eq(
                  schema.stageMachineAssignments.stageRunId,
                  target.stageRunId,
                ),
              ),
            );
          await db.insert(schema.stageMachineAssignments).values(
            plan.machineIds.map((machineId) => ({
              id: deps.ids.next(),
              locationId,
              stageRunId: target.stageRunId,
              machineId,
              plannedStartAt: target.plannedStartAt,
              plannedEndAt: target.plannedEndAt,
              actualStartAt: null,
              actualEndAt: null,
              status: 'active',
              createdAt: plan.now,
              updatedAt: plan.now,
            })),
          );
        }

        const [batch] = await db
          .update(schema.productionBatches)
          .set({
            status: plan.batchLifecycle?.state ?? plan.context.batch.status,
            version: plan.context.batch.version + 1,
            updatedAt: plan.now,
            ...(!plan.context.batch.membershipFrozen
              ? { membershipFrozenAt: plan.now, membershipFrozenBy: actorId }
              : {}),
            ...(plan.batchLifecycle?.from === 'queued'
              ? { startedAt: plan.now }
              : {}),
            ...(plan.batchLifecycle?.state === 'finished'
              ? { finishedAt: plan.now }
              : {}),
          })
          .where(
            and(
              eq(schema.productionBatches.locationId, locationId),
              eq(schema.productionBatches.id, plan.context.batch.id),
              eq(schema.productionBatches.productionRunId, plan.context.run.id),
              eq(schema.productionBatches.version, plan.context.batch.version),
              eq(
                schema.productionBatches.status,
                plan.batchLifecycle?.from ?? plan.context.batch.status,
              ),
            ),
          )
          .returning({ version: schema.productionBatches.version });
        if (batch === undefined)
          return {
            kind: 'failure',
            failure: conflict(
              'production_reconciliation_batch_version_conflict',
              'Production batch changed during reconciliation.',
            ),
          };

        let queueVersion = plan.context.run.queueVersion;
        if (plan.context.batch.status === 'queued') {
          queueVersion += 1;
          const [run] = await db
            .update(schema.productionRuns)
            .set({
              queueVersion,
              overtimeProposalHash: null,
              overtimeQueueVersion: null,
              overtimeAcknowledgedBy: null,
              overtimeAcknowledgedAt: null,
              updatedAt: plan.now,
            })
            .where(
              and(
                eq(schema.productionRuns.locationId, locationId),
                eq(schema.productionRuns.id, plan.context.run.id),
                eq(
                  schema.productionRuns.queueVersion,
                  plan.context.run.queueVersion,
                ),
                eq(schema.productionRuns.status, 'started'),
              ),
            )
            .returning({ id: schema.productionRuns.id });
          if (run === undefined)
            return {
              kind: 'failure',
              failure: conflict(
                'production_reconciliation_queue_version_conflict',
                'Production queue changed during reconciliation.',
              ),
            };
        }

        let terminal = {
          finishedOrderCount: 0,
          finishedBagCount: 0,
          runCompleted: false,
          shiftClosed: false,
        };
        if (plan.projection.batchStatus === 'finished') {
          if (plan.terminalLifecycle === null)
            throw invariant(
              'production_reconciliation_terminal_lifecycle_missing',
              'Terminal lifecycle decisions are missing.',
            );
          const completed = await completeReconciledBatch(
            db,
            {
              locationId,
              productionBatchId: plan.context.batch.id,
              productionRunId: plan.context.run.id,
              lifecycle: plan.terminalLifecycle,
              now: plan.now,
            },
            schema,
          );
          if (completed.kind === 'failure') return completed;
          terminal = completed.value;
        }
        return {
          kind: 'success',
          value: {
            status: 'reconciled',
            productionRunId: plan.context.run.id,
            productionBatchId: plan.context.batch.id,
            milestone: plan.projection.targetMilestone,
            queueVersion,
            batchVersion: batch.version,
            stageVersions: plan.context.stages.map((stage) => ({
              stageRunId: stage.stageRunId,
              version: nextVersions.get(stage.stageRunId) ?? stage.version,
            })),
            ...terminal,
            replayed: false,
          },
        };
      },
      appendWorkEvent: (event) =>
        appendReconcileBatchProgressWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;
  return {
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repo) => {
        const cell = await work(repo);
        return cell.kind === 'success'
          ? result.ok(cell.value)
          : result.err(cell.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  };
};
