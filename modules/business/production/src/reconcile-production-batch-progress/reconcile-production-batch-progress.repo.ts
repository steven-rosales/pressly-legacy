import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { completeProductionBatch } from '../persistence/complete-production-batch.ts';
import { completeAssignedOrderStageAttempts } from '../persistence/complete-order-stage-attempts.ts';
import { iso } from '../persistence/production-mappers.ts';
import type {
  ReconcileProductionBatchProgressRepository,
  ReconciliationContext,
  ReconciliationStage,
} from './reconcile-production-batch-progress.port.ts';

const stageKind = (value: string): ReconciliationStage['stage'] => {
  if (
    value === 'sorting' ||
    value === 'washing' ||
    value === 'drying' ||
    value === 'folding_packaging'
  )
    return value;
  throw new Error(`Unknown production stage kind: ${value}.`);
};

const stageStatus = (value: string): ReconciliationStage['status'] => {
  if (value === 'planned' || value === 'started' || value === 'completed')
    return value;
  throw new Error(`Unknown production stage status: ${value}.`);
};

const attemptStatus = (
  value: string,
): ReconciliationContext['attempts'][number]['status'] => {
  if (value === 'assigned' || value === 'completed' || value === 'released')
    return value;
  throw new Error(`Unknown order-stage attempt status: ${value}.`);
};

export const makeReconcileProductionBatchProgressRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ReconcileProductionBatchProgressRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadContext: async (locationId, productionRunId, productionBatchId) => {
      const [run] = await db
        .select()
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.id, productionRunId),
          ),
        )
        .limit(1)
        .for('update');
      if (run === undefined) return null;

      const [batch] = await db
        .select()
        .from(laundryProduction.productionBatches)
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, productionBatchId),
            eq(
              laundryProduction.productionBatches.productionRunId,
              productionRunId,
            ),
          ),
        )
        .limit(1)
        .for('update');
      if (batch === undefined) return null;
      const [shift] = await db
        .select({ status: laundryProduction.productionShifts.status })
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, run.productionShiftId),
          ),
        )
        .limit(1);
      if (shift === undefined) return null;

      const stageRows = await db
        .select()
        .from(laundryProduction.stageRuns)
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(
              laundryProduction.stageRuns.productionBatchId,
              productionBatchId,
            ),
          ),
        )
        .orderBy(asc(laundryProduction.stageRuns.plannedStartAt))
        .for('update');
      const stageIds = stageRows.map((stage) => stage.id);
      const attemptRows =
        stageIds.length === 0
          ? []
          : await db
              .select({
                id: laundryProduction.productionOrderStageAttempts.id,
                stageRunId:
                  laundryProduction.productionOrderStageAttempts.stageRunId,
                status: laundryProduction.productionOrderStageAttempts.status,
              })
              .from(laundryProduction.productionOrderStageAttempts)
              .where(
                and(
                  eq(
                    laundryProduction.productionOrderStageAttempts.locationId,
                    locationId,
                  ),
                  inArray(
                    laundryProduction.productionOrderStageAttempts.stageRunId,
                    stageIds,
                  ),
                ),
              )
              .for('update');
      const activeMemberships = await db
        .select({
          productionOrderId:
            laundryProduction.productionBatchOrders.productionOrderId,
        })
        .from(laundryProduction.productionBatchOrders)
        .where(
          and(
            eq(laundryProduction.productionBatchOrders.locationId, locationId),
            eq(
              laundryProduction.productionBatchOrders.productionBatchId,
              productionBatchId,
            ),
            eq(laundryProduction.productionBatchOrders.active, true),
          ),
        )
        .for('update');
      const activeOrderIds = activeMemberships.map(
        (membership) => membership.productionOrderId,
      );
      const activeOrderRows =
        activeOrderIds.length === 0
          ? []
          : await db
              .select({
                id: laundryProduction.productionOrders.id,
                status: laundryProduction.productionOrders.operationalStatus,
                executionStatus:
                  laundryProduction.productionOrders.executionStatus,
                resolutionState:
                  laundryProduction.productionOrders.resolutionState,
                version: laundryProduction.productionOrders.version,
              })
              .from(laundryProduction.productionOrders)
              .where(
                and(
                  eq(laundryProduction.productionOrders.locationId, locationId),
                  inArray(
                    laundryProduction.productionOrders.id,
                    activeOrderIds,
                  ),
                ),
              )
              .for('update');

      const [
        activeStageRows,
        assignmentRows,
        machineRows,
        stationRows,
        batches,
        runs,
      ] = await Promise.all([
        db
          .select({
            productionBatchId: laundryProduction.stageRuns.productionBatchId,
            stageKind: laundryProduction.stageRuns.stageKind,
          })
          .from(laundryProduction.stageRuns)
          .where(
            and(
              eq(laundryProduction.stageRuns.locationId, locationId),
              eq(laundryProduction.stageRuns.status, 'started'),
            ),
          ),
        db
          .select()
          .from(laundryProduction.stageMachineAssignments)
          .where(
            eq(
              laundryProduction.stageMachineAssignments.locationId,
              locationId,
            ),
          ),
        db
          .select()
          .from(laundryProduction.machines)
          .where(eq(laundryProduction.machines.locationId, locationId)),
        db
          .select()
          .from(laundryProduction.stations)
          .where(eq(laundryProduction.stations.locationId, locationId)),
        db
          .select({
            id: laundryProduction.productionBatches.id,
            status: laundryProduction.productionBatches.status,
          })
          .from(laundryProduction.productionBatches)
          .where(
            and(
              eq(laundryProduction.productionBatches.locationId, locationId),
              eq(
                laundryProduction.productionBatches.productionRunId,
                productionRunId,
              ),
            ),
          ),
        db
          .select({
            id: laundryProduction.productionRuns.id,
            status: laundryProduction.productionRuns.status,
          })
          .from(laundryProduction.productionRuns)
          .where(
            and(
              eq(laundryProduction.productionRuns.locationId, locationId),
              eq(
                laundryProduction.productionRuns.productionShiftId,
                run.productionShiftId,
              ),
            ),
          ),
      ]);

      const stationKindById = new Map(
        stationRows.map((station) => [station.id, station.kind]),
      );
      const occupiedMachineIds = new Set(
        assignmentRows
          .filter(
            (assignment) =>
              assignment.status === 'active' &&
              !stageIds.includes(assignment.stageRunId),
          )
          .map((assignment) => assignment.machineId),
      );

      const context: ReconciliationContext = {
        run: {
          id: run.id,
          status: run.status,
          queueVersion: run.queueVersion,
          productionShiftId: run.productionShiftId,
          productionShiftStatus: shift.status,
        },
        batch: {
          id: batch.id,
          status: batch.status,
          version: batch.version,
          derivedWeightLbs: batch.derivedWeightLbs,
          membershipFrozen: batch.membershipFrozenAt !== null,
        },
        stages: stageRows.map((stage) => ({
          stageRunId: stage.id,
          stage: stageKind(stage.stageKind),
          status: stageStatus(stage.status),
          plannedStartAt: iso(stage.plannedStartAt),
          plannedEndAt: iso(stage.plannedEndAt),
          actualStartAt:
            stage.actualStartAt === null ? null : iso(stage.actualStartAt),
          actualEndAt:
            stage.actualEndAt === null ? null : iso(stage.actualEndAt),
          actualStartProvenance: stage.actualStartProvenance,
          actualEndProvenance: stage.actualEndProvenance,
          version: stage.version,
        })),
        attempts: attemptRows.map((attempt) => ({
          id: attempt.id,
          stageRunId: attempt.stageRunId,
          status: attemptStatus(attempt.status),
        })),
        activeOrders: activeOrderRows,
        activeStageKinds: activeStageRows
          .filter((stage) => stage.productionBatchId !== productionBatchId)
          .map((stage) => stage.stageKind),
        machines: machineRows.flatMap((machine) =>
          machine.effectiveCapacityLbs === null
            ? []
            : [
                {
                  id: machine.id,
                  stationKind:
                    stationKindById.get(machine.stationId) ?? 'unknown',
                  effectiveCapacityLbs: machine.effectiveCapacityLbs,
                  active: machine.isActive,
                  overlaps: occupiedMachineIds.has(machine.id),
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
      return context;
    },
    reconcile: async ({
      locationId,
      context,
      projection,
      stageLifecycles,
      batchLifecycle,
      attemptLifecycles,
      machineIds,
      terminalLifecycle,
      actorId,
      now,
    }) => {
      const nextVersionByStageId = new Map(
        context.stages.map((stage) => [stage.stageRunId, stage.version]),
      );

      for (const transition of stageLifecycles) {
        const current = context.stages.find(
          (stage) => stage.stageRunId === transition.stageRunId,
        );
        if (current === undefined)
          throw new Error('Reconciliation stage context is incomplete.');

        const [updated] = await db
          .update(laundryProduction.stageRuns)
          .set({
            status: transition.lifecycle.state,
            version: current.version + 1,
            updatedAt: now,
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
              eq(laundryProduction.stageRuns.locationId, locationId),
              eq(laundryProduction.stageRuns.id, current.stageRunId),
              eq(laundryProduction.stageRuns.version, current.version),
              eq(laundryProduction.stageRuns.status, transition.lifecycle.from),
            ),
          )
          .returning({
            id: laundryProduction.stageRuns.id,
            version: laundryProduction.stageRuns.version,
          });
        if (updated === undefined)
          throw new Error('Production stage changed during reconciliation.');
        nextVersionByStageId.set(updated.id, updated.version);

        if (transition.lifecycle.state === 'completed') {
          if (transition.lifecycle.from === 'planned') {
            // A planned -> completed jump records only that the floor passed
            // this stage. The immutable schedule and stage window retain the
            // plan, but no machine use was observed, so remove the mutable
            // assignment projection instead of presenting it as actual history.
            await db
              .delete(laundryProduction.stageMachineAssignments)
              .where(
                and(
                  eq(
                    laundryProduction.stageMachineAssignments.locationId,
                    locationId,
                  ),
                  eq(
                    laundryProduction.stageMachineAssignments.stageRunId,
                    current.stageRunId,
                  ),
                ),
              );
          } else {
            // A started stage has a known live machine association. Preserve
            // that association while recording that its end time was missed.
            await db
              .update(laundryProduction.stageMachineAssignments)
              .set({ status: 'completed', actualEndAt: null, updatedAt: now })
              .where(
                and(
                  eq(
                    laundryProduction.stageMachineAssignments.locationId,
                    locationId,
                  ),
                  eq(
                    laundryProduction.stageMachineAssignments.stageRunId,
                    current.stageRunId,
                  ),
                ),
              );
          }

          await completeAssignedOrderStageAttempts(db, {
            locationId,
            stageRunId: current.stageRunId,
            attempts: attemptLifecycles.filter(
              (attempt) => attempt.stageRunId === current.stageRunId,
            ),
            actorId,
            now,
          });
        }
      }

      if (
        projection.activeStage === 'washing' ||
        projection.activeStage === 'drying'
      ) {
        const targetStage = context.stages.find(
          (stage) => stage.stage === projection.activeStage,
        );
        if (targetStage === undefined)
          throw new Error('Active reconciliation stage was not found.');
        await db
          .delete(laundryProduction.stageMachineAssignments)
          .where(
            and(
              eq(
                laundryProduction.stageMachineAssignments.locationId,
                locationId,
              ),
              eq(
                laundryProduction.stageMachineAssignments.stageRunId,
                targetStage.stageRunId,
              ),
            ),
          );
        await db.insert(laundryProduction.stageMachineAssignments).values(
          machineIds.map((machineId) => ({
            id: deps.ids.next(),
            locationId,
            stageRunId: targetStage.stageRunId,
            machineId,
            plannedStartAt: new Date(targetStage.plannedStartAt),
            plannedEndAt: new Date(targetStage.plannedEndAt),
            actualStartAt: null,
            actualEndAt: null,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      const [updatedBatch] = await db
        .update(laundryProduction.productionBatches)
        .set({
          status: batchLifecycle?.state ?? context.batch.status,
          version: context.batch.version + 1,
          updatedAt: now,
          ...(!context.batch.membershipFrozen
            ? { membershipFrozenAt: now, membershipFrozenBy: actorId }
            : {}),
          ...(batchLifecycle?.from === 'queued' ? { startedAt: now } : {}),
          ...(batchLifecycle?.state === 'finished' ? { finishedAt: now } : {}),
        })
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, context.batch.id),
            eq(
              laundryProduction.productionBatches.productionRunId,
              context.run.id,
            ),
            eq(
              laundryProduction.productionBatches.version,
              context.batch.version,
            ),
            eq(
              laundryProduction.productionBatches.status,
              batchLifecycle?.from ?? context.batch.status,
            ),
          ),
        )
        .returning({ version: laundryProduction.productionBatches.version });
      if (updatedBatch === undefined)
        throw new Error('Production batch changed during reconciliation.');

      let queueVersion = context.run.queueVersion;
      if (context.batch.status === 'queued') {
        queueVersion += 1;
        const [updatedRun] = await db
          .update(laundryProduction.productionRuns)
          .set({
            queueVersion,
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
            overtimeAcknowledgedBy: null,
            overtimeAcknowledgedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(laundryProduction.productionRuns.locationId, locationId),
              eq(laundryProduction.productionRuns.id, context.run.id),
              eq(
                laundryProduction.productionRuns.queueVersion,
                context.run.queueVersion,
              ),
              eq(laundryProduction.productionRuns.status, 'started'),
            ),
          )
          .returning({ id: laundryProduction.productionRuns.id });
        if (updatedRun === undefined)
          throw new Error('Production queue changed during reconciliation.');
      }

      const terminalization =
        projection.batchStatus === 'finished'
          ? terminalLifecycle === null
            ? (() => {
                throw new Error('Terminal lifecycle decisions are missing.');
              })()
            : await completeProductionBatch(db, {
                locationId,
                productionBatchId: context.batch.id,
                productionRunId: context.run.id,
                lifecycle: terminalLifecycle,
                now,
              })
          : {
              finishedOrderCount: 0,
              finishedBagCount: 0,
              runCompleted: false,
              shiftClosed: false,
            };

      return {
        status: 'reconciled',
        productionRunId: context.run.id,
        productionBatchId: context.batch.id,
        milestone: projection.targetMilestone,
        queueVersion,
        batchVersion: updatedBatch.version,
        stageVersions: context.stages.map((stage) => ({
          stageRunId: stage.stageRunId,
          version: nextVersionByStageId.get(stage.stageRunId) ?? stage.version,
        })),
        ...terminalization,
        replayed: false,
      };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
