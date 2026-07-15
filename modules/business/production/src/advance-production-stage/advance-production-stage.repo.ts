import {
  and,
  eq,
  inArray,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { AdvanceProductionStageRepository } from './advance-production-stage.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { loadStageTransitionContext } from '../persistence/stage-transition-context.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

export const makeAdvanceProductionStageRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): AdvanceProductionStageRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadStageTransitionContext: (locationId, stageRunId) =>
      loadStageTransitionContext(db, locationId, stageRunId),
    transitionStage: async ({
      locationId,
      stageRunId,
      expectedVersion,
      nextState,
      actorId,
      now,
    }) => {
      const [stage] = await db
        .update(laundryProduction.stageRuns)
        .set({
          status: nextState,
          version: expectedVersion + 1,
          updatedAt: now,
          ...(nextState === 'started'
            ? { actualStartAt: now, startedBy: actorId }
            : { actualEndAt: now, completedBy: actorId }),
        })
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(laundryProduction.stageRuns.id, stageRunId),
            eq(laundryProduction.stageRuns.version, expectedVersion),
          ),
        )
        .returning();
      if (stage === undefined) return null;

      const assignments = await db
        .select({
          id: laundryProduction.stageMachineAssignments.id,
          status: laundryProduction.stageMachineAssignments.status,
        })
        .from(laundryProduction.stageMachineAssignments)
        .where(
          and(
            eq(
              laundryProduction.stageMachineAssignments.locationId,
              locationId,
            ),
            eq(
              laundryProduction.stageMachineAssignments.stageRunId,
              stageRunId,
            ),
          ),
        );
      const expectedAssignmentStatus =
        nextState === 'started' ? 'planned' : 'active';
      if (
        assignments.some(
          (assignment) => assignment.status !== expectedAssignmentStatus,
        )
      )
        throw new Error('Stage machine assignment state is inconsistent.');

      const updatedAssignments = await db
        .update(laundryProduction.stageMachineAssignments)
        .set({
          status: nextState === 'started' ? 'active' : 'completed',
          ...(nextState === 'started'
            ? { actualStartAt: now }
            : { actualEndAt: now }),
          updatedAt: now,
        })
        .where(
          and(
            eq(
              laundryProduction.stageMachineAssignments.locationId,
              locationId,
            ),
            eq(
              laundryProduction.stageMachineAssignments.stageRunId,
              stageRunId,
            ),
            eq(
              laundryProduction.stageMachineAssignments.status,
              expectedAssignmentStatus,
            ),
          ),
        )
        .returning({ id: laundryProduction.stageMachineAssignments.id });
      if (updatedAssignments.length !== assignments.length)
        throw new Error('Stage machine assignments changed concurrently.');

      const [batch] = await db
        .select()
        .from(laundryProduction.productionBatches)
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, stage.productionBatchId),
          ),
        )
        .limit(1);
      if (batch === undefined) throw new Error('Batch not found.');
      const anchorsMutableQueue =
        nextState === 'started' && batch.status === 'queued';
      const [updatedBatch] = await db
        .update(laundryProduction.productionBatches)
        .set({
          status:
            nextState === 'started'
              ? stage.stageKind
              : stage.stageKind === 'folding_packaging'
                ? 'finished'
                : batch.status,
          version: batch.version + 1,
          updatedAt: now,
          ...(nextState === 'started' && batch.startedAt === null
            ? { startedAt: now }
            : {}),
          ...(anchorsMutableQueue
            ? {
                membershipFrozenAt: batch.membershipFrozenAt ?? now,
                membershipFrozenBy: batch.membershipFrozenBy ?? actorId,
              }
            : {}),
          ...(nextState === 'completed' &&
          stage.stageKind === 'folding_packaging'
            ? { finishedAt: now }
            : {}),
        })
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, batch.id),
            eq(laundryProduction.productionBatches.version, batch.version),
          ),
        )
        .returning();
      if (updatedBatch === undefined)
        throw new Error('Production batch changed during stage transition.');

      if (anchorsMutableQueue) {
        const [updatedRunQueue] = await db
          .update(laundryProduction.productionRuns)
          .set({
            queueVersion: sql`${laundryProduction.productionRuns.queueVersion} + 1`,
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
            overtimeAcknowledgedBy: null,
            overtimeAcknowledgedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(laundryProduction.productionRuns.locationId, locationId),
              eq(laundryProduction.productionRuns.id, batch.productionRunId),
              eq(laundryProduction.productionRuns.status, 'started'),
            ),
          )
          .returning({ id: laundryProduction.productionRuns.id });
        if (updatedRunQueue === undefined)
          throw new Error('Production run changed during stage transition.');
      }

      if (
        nextState === 'completed' &&
        stage.stageKind === 'folding_packaging'
      ) {
        const activeOrderLinks = await db
          .select({
            productionOrderId:
              laundryProduction.productionBatchOrders.productionOrderId,
          })
          .from(laundryProduction.productionBatchOrders)
          .where(
            and(
              eq(
                laundryProduction.productionBatchOrders.locationId,
                locationId,
              ),
              eq(
                laundryProduction.productionBatchOrders.productionBatchId,
                batch.id,
              ),
              eq(laundryProduction.productionBatchOrders.active, true),
            ),
          );
        const orderIds = activeOrderLinks.map((link) => link.productionOrderId);
        if (orderIds.length === 0)
          throw new Error('Finished batch has no active production orders.');

        const finishedOrders = await db
          .update(laundryProduction.productionOrders)
          .set({
            status: 'finished',
            finishedAt: now,
            version: sql`${laundryProduction.productionOrders.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(laundryProduction.productionOrders.locationId, locationId),
              inArray(laundryProduction.productionOrders.id, orderIds),
              eq(laundryProduction.productionOrders.status, 'scheduled'),
            ),
          )
          .returning({
            id: laundryProduction.productionOrders.id,
            bagCount: laundryProduction.productionOrders.bagCount,
          });
        if (finishedOrders.length !== orderIds.length)
          throw new Error(
            'Finished batch contains an order outside scheduled production.',
          );

        if (finishedOrders.some((order) => order.bagCount === null))
          throw new Error('Finished production order is missing bag intake.');
        const expectedBagCount = finishedOrders.reduce(
          (total, order) => total + order.bagCount!,
          0,
        );
        const finishedBags = await db
          .update(laundryProduction.bags)
          .set({ status: 'finished' })
          .where(inArray(laundryProduction.bags.productionOrderId, orderIds))
          .returning({ id: laundryProduction.bags.id });
        if (finishedBags.length !== expectedBagCount)
          throw new Error(
            'Finished production order bag count is inconsistent.',
          );

        const deactivatedOrderLinks = await db
          .update(laundryProduction.productionBatchOrders)
          .set({ active: false })
          .where(
            and(
              eq(
                laundryProduction.productionBatchOrders.locationId,
                locationId,
              ),
              eq(
                laundryProduction.productionBatchOrders.productionBatchId,
                batch.id,
              ),
              eq(laundryProduction.productionBatchOrders.active, true),
            ),
          )
          .returning({
            productionOrderId:
              laundryProduction.productionBatchOrders.productionOrderId,
          });
        if (deactivatedOrderLinks.length !== orderIds.length)
          throw new Error('Production batch order links changed concurrently.');

        const runBatches = await db
          .select()
          .from(laundryProduction.productionBatches)
          .where(
            and(
              eq(laundryProduction.productionBatches.locationId, locationId),
              eq(
                laundryProduction.productionBatches.productionRunId,
                batch.productionRunId,
              ),
            ),
          );
        if (runBatches.every((candidate) => candidate.status === 'finished')) {
          const [run] = await db
            .select()
            .from(laundryProduction.productionRuns)
            .where(
              and(
                eq(laundryProduction.productionRuns.locationId, locationId),
                eq(laundryProduction.productionRuns.id, batch.productionRunId),
              ),
            )
            .limit(1);
          if (run === undefined) throw new Error('Production run not found.');
          const [completedRun] = await db
            .update(laundryProduction.productionRuns)
            .set({
              status: 'completed',
              completedAt: now,
              version: run.version + 1,
              updatedAt: now,
            })
            .where(
              and(
                eq(laundryProduction.productionRuns.locationId, locationId),
                eq(laundryProduction.productionRuns.id, run.id),
                eq(laundryProduction.productionRuns.status, 'started'),
                eq(laundryProduction.productionRuns.version, run.version),
              ),
            )
            .returning({ id: laundryProduction.productionRuns.id });
          if (completedRun === undefined)
            throw new Error('Production run changed during completion.');

          const siblingRuns = await db
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
            );
          if (
            siblingRuns.every((candidate) => candidate.status === 'completed')
          ) {
            const [closedShift] = await db
              .update(laundryProduction.productionShifts)
              .set({
                status: 'closed',
                version: sql`${laundryProduction.productionShifts.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(laundryProduction.productionShifts.locationId, locationId),
                  eq(
                    laundryProduction.productionShifts.id,
                    run.productionShiftId,
                  ),
                  eq(laundryProduction.productionShifts.status, 'open'),
                ),
              )
              .returning({ id: laundryProduction.productionShifts.id });
            if (closedShift === undefined)
              throw new Error('Production shift changed during completion.');
          }
        }
      }

      return { entityId: stage.id, version: stage.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
