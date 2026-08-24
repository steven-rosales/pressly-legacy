import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { OrderRouteProposalContext } from '../../../model/order-route-proposal/model.ts';
import type { PreviewOrderRouteRepository } from './types.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const asStage = (
  value: string,
): OrderRouteProposalContext['attempts'][number]['stage'] => {
  switch (value) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_stage_invalid',
        `Unknown production stage: ${value}.`,
      );
  }
};

const asStageStatus = (
  value: string,
): OrderRouteProposalContext['candidates'][number]['stages'][number]['status'] => {
  switch (value) {
    case 'planned':
    case 'started':
    case 'completed':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_stage_status_invalid',
        `Unknown stage-run status: ${value}.`,
      );
  }
};

const asAttemptStatus = (
  value: string,
): OrderRouteProposalContext['attempts'][number]['status'] => {
  switch (value) {
    case 'assigned':
    case 'completed':
    case 'released':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_attempt_status_invalid',
        `Unknown order-stage attempt status: ${value}.`,
      );
  }
};

const loadContext = async (
  database: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    productionRunId: string;
    productionOrderId: string;
  }>,
  schema: ProductionSchema,
): Promise<OrderRouteProposalContext | null> => {
  const [run] = await database
    .select({
      id: schema.productionRuns.id,
      status: schema.productionRuns.status,
      queueVersion: schema.productionRuns.queueVersion,
    })
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.id, input.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) return null;

  const [order] = await database
    .select({
      id: schema.productionOrders.id,
      operationalStatus: schema.productionOrders.operationalStatus,
      executionStatus: schema.productionOrders.executionStatus,
      resolutionState: schema.productionOrders.resolutionState,
      version: schema.productionOrders.version,
      weightLbs: schema.productionOrders.derivedWeightLbs,
    })
    .from(schema.productionOrders)
    .where(
      and(
        eq(schema.productionOrders.locationId, input.locationId),
        eq(schema.productionOrders.id, input.productionOrderId),
      ),
    )
    .limit(1);
  if (order === undefined) return null;

  const [membership] = await database
    .select({
      id: schema.productionBatchOrders.id,
      productionBatchId: schema.productionBatchOrders.productionBatchId,
    })
    .from(schema.productionBatchOrders)
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, input.locationId),
        eq(
          schema.productionBatchOrders.productionOrderId,
          input.productionOrderId,
        ),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .limit(1);
  if (membership === undefined) return null;

  const batchRows = await database
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, input.locationId),
        eq(schema.productionBatches.productionRunId, input.productionRunId),
      ),
    )
    .orderBy(
      asc(schema.productionBatches.sequenceIndex),
      asc(schema.productionBatches.id),
    );
  const source = batchRows.find(
    (batch) => batch.id === membership.productionBatchId,
  );
  if (source === undefined) return null;

  const batchIds = batchRows.map((batch) => batch.id);
  const stageRows = await database
    .select({
      id: schema.stageRuns.id,
      productionBatchId: schema.stageRuns.productionBatchId,
      stageKind: schema.stageRuns.stageKind,
      status: schema.stageRuns.status,
    })
    .from(schema.stageRuns)
    .where(
      and(
        eq(schema.stageRuns.locationId, input.locationId),
        inArray(schema.stageRuns.productionBatchId, batchIds),
      ),
    )
    .orderBy(asc(schema.stageRuns.plannedStartAt), asc(schema.stageRuns.id));
  const stageIds = stageRows.map((stage) => stage.id);

  const loadMachineCapacities = async () => {
    if (stageIds.length === 0) return [];
    return database
      .select({
        stageRunId: schema.stageMachineAssignments.stageRunId,
        capacityLbs: schema.machines.effectiveCapacityLbs,
      })
      .from(schema.stageMachineAssignments)
      .innerJoin(
        schema.machines,
        and(
          eq(schema.machines.id, schema.stageMachineAssignments.machineId),
          eq(
            schema.machines.locationId,
            schema.stageMachineAssignments.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.stageMachineAssignments.locationId, input.locationId),
          eq(schema.stageMachineAssignments.status, 'planned'),
          eq(schema.machines.isActive, true),
          inArray(schema.stageMachineAssignments.stageRunId, stageIds),
        ),
      )
      .orderBy(asc(schema.machines.id), asc(schema.stageMachineAssignments.id));
  };

  const [attemptRows, assignedRows, sourceMembershipRows, machineCapacityRows] =
    await Promise.all([
      database
        .select({
          id: schema.productionOrderStageAttempts.id,
          stageRunId: schema.productionOrderStageAttempts.stageRunId,
          productionBatchId: schema.stageRuns.productionBatchId,
          stageKind: schema.productionOrderStageAttempts.stageKind,
          attemptNumber: schema.productionOrderStageAttempts.attemptNumber,
          status: schema.productionOrderStageAttempts.status,
        })
        .from(schema.productionOrderStageAttempts)
        .innerJoin(
          schema.stageRuns,
          and(
            eq(
              schema.stageRuns.id,
              schema.productionOrderStageAttempts.stageRunId,
            ),
            eq(
              schema.stageRuns.locationId,
              schema.productionOrderStageAttempts.locationId,
            ),
          ),
        )
        .where(
          and(
            eq(
              schema.productionOrderStageAttempts.locationId,
              input.locationId,
            ),
            eq(
              schema.productionOrderStageAttempts.productionRunId,
              input.productionRunId,
            ),
            eq(
              schema.productionOrderStageAttempts.productionOrderId,
              input.productionOrderId,
            ),
          ),
        )
        .orderBy(
          asc(schema.stageRuns.plannedStartAt),
          asc(schema.productionOrderStageAttempts.attemptNumber),
          asc(schema.productionOrderStageAttempts.id),
        ),
      stageIds.length === 0
        ? Promise.resolve([])
        : database
            .select({
              stageRunId: schema.productionOrderStageAttempts.stageRunId,
              weightLbs: schema.productionOrders.derivedWeightLbs,
            })
            .from(schema.productionOrderStageAttempts)
            .innerJoin(
              schema.productionOrders,
              and(
                eq(
                  schema.productionOrders.id,
                  schema.productionOrderStageAttempts.productionOrderId,
                ),
                eq(
                  schema.productionOrders.locationId,
                  schema.productionOrderStageAttempts.locationId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  schema.productionOrderStageAttempts.locationId,
                  input.locationId,
                ),
                eq(schema.productionOrderStageAttempts.status, 'assigned'),
                inArray(
                  schema.productionOrderStageAttempts.stageRunId,
                  stageIds,
                ),
              ),
            ),
      database
        .select({
          productionOrderId: schema.productionBatchOrders.productionOrderId,
        })
        .from(schema.productionBatchOrders)
        .where(
          and(
            eq(schema.productionBatchOrders.locationId, input.locationId),
            eq(schema.productionBatchOrders.productionBatchId, source.id),
            eq(schema.productionBatchOrders.active, true),
          ),
        ),
      loadMachineCapacities(),
    ]);

  const weightByStage = new Map<string, number>();
  for (const assigned of assignedRows)
    weightByStage.set(
      assigned.stageRunId,
      (weightByStage.get(assigned.stageRunId) ?? 0) + assigned.weightLbs,
    );

  const machineCapacityByStage = new Map<string, number>();
  for (const assignment of machineCapacityRows) {
    if (assignment.capacityLbs === null) continue;
    machineCapacityByStage.set(
      assignment.stageRunId,
      (machineCapacityByStage.get(assignment.stageRunId) ?? 0) +
        assignment.capacityLbs,
    );
  }

  return {
    run,
    order,
    source: {
      membershipId: membership.id,
      productionBatchId: source.id,
      sequence: source.sequenceIndex,
      status: source.status,
      membershipFrozen: source.membershipFrozenAt !== null,
      version: source.version,
      derivedWeightLbs: source.derivedWeightLbs,
      activeOrderCount: sourceMembershipRows.length,
    },
    candidates: batchRows.map((batch) => ({
      productionBatchId: batch.id,
      sequence: batch.sequenceIndex,
      status: batch.status,
      membershipFrozen: batch.membershipFrozenAt !== null,
      version: batch.version,
      derivedWeightLbs: batch.derivedWeightLbs,
      pulseCapacityLbs: batch.pulseCapacityLbs,
      stages: stageRows
        .filter((stage) => stage.productionBatchId === batch.id)
        .map((stage) => {
          const stageKind = asStage(stage.stageKind);
          const stageStatus = asStageStatus(stage.status);
          const assignedMachineCapacityLbs =
            machineCapacityByStage.get(stage.id) ?? 0;
          const plannedMachineStage =
            stageStatus === 'planned' &&
            (stageKind === 'washing' || stageKind === 'drying');
          return {
            stageRunId: stage.id,
            stage: stageKind,
            status: stageStatus,
            assignedWeightLbs:
              stageStatus === 'planned'
                ? Math.max(
                    weightByStage.get(stage.id) ?? 0,
                    batch.derivedWeightLbs,
                  )
                : (weightByStage.get(stage.id) ?? 0),
            capacityLbs: plannedMachineStage
              ? Math.min(batch.pulseCapacityLbs, assignedMachineCapacityLbs)
              : batch.pulseCapacityLbs,
          };
        }),
    })),
    attempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      stageRunId: attempt.stageRunId,
      productionBatchId: attempt.productionBatchId,
      stage: asStage(attempt.stageKind),
      attemptNumber: attempt.attemptNumber,
      status: asAttemptStatus(attempt.status),
    })),
  };
};

export const makePreviewOrderRoutePostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
): PreviewOrderRouteRepository => ({
  load: (input) =>
    database.transaction(
      (transaction) => loadContext(transaction, input, schema),
      {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      },
    ),
});
