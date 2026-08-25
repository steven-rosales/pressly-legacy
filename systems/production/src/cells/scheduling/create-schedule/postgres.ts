import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, asc, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  ScheduleProposal,
  SchedulingInput,
  SchedulingOutput,
} from '../../../model/production-schedule/model.ts';
import {
  readProductionSchedulingInput,
  readProductionSchedulingOutput,
  writeProductionSchedulingInput,
  writeProductionSchedulingOutput,
} from '../../../postgres/production-schedule/schedule-json.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  CreateScheduleRepository,
  CreateScheduleTransactionRepository,
} from './execute.ts';
import type { StoredCreateScheduleWorkEvent } from './idempotency.ts';
import {
  appendCreateScheduleWorkEvent,
  findCreateScheduleWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });
const iso = (value: Date): string => value.toISOString();
const lockLocation = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};
const proposal = (
  id: string,
  input: SchedulingInput,
  output: SchedulingOutput,
  now: Date,
): ScheduleProposal => ({
  scheduleRunId: id,
  productionShiftId: input.shift.id,
  schedulerConfigId: input.config.id,
  status: 'draft',
  inputSnapshotHash: output.inputSnapshotHash,
  outputPlanHash: output.outputPlanHash,
  algorithmVersion: output.algorithmVersion,
  pulseMinutes: output.pulseMinutes,
  pulseCapacityLbs: output.pulseCapacityLbs,
  batchCount: output.batchCount,
  makespanMinutes: output.makespanMinutes,
  plannedCompletionAt: output.plannedCompletionAt,
  batches: output.batches.map((batch) => ({
    ...batch,
    orderIds: [...batch.orderIds],
    stages: batch.stages.map((stage) => ({
      ...stage,
      machineIds: [...stage.machineIds],
    })),
  })),
  unplacedOrderIds: [...output.unplacedOrderIds],
  warnings: output.warnings.map((warning) => ({
    ...warning,
    ...(warning.orderIds === undefined
      ? {}
      : { orderIds: [...warning.orderIds] }),
  })),
  createdAt: now.toISOString(),
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
});

export type CreateSchedulePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;
export const makeCreateSchedulePostgresRepository = (
  deps: CreateSchedulePostgresDependencies,
  schema: ProductionSchema,
): CreateScheduleRepository<StoredCreateScheduleWorkEvent> => {
  const native = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): CreateScheduleTransactionRepository<StoredCreateScheduleWorkEvent> => ({
      findWorkEvent: (key) => findCreateScheduleWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) => lockLocation(db, locationId),
      lockShiftForPlanning: async (locationId, productionShiftId) => {
        const [shift] = await db
          .select({ id: schema.productionShifts.id })
          .from(schema.productionShifts)
          .where(
            and(
              eq(schema.productionShifts.locationId, locationId),
              eq(schema.productionShifts.id, productionShiftId),
            ),
          )
          .limit(1)
          .for('update');
        if (shift === undefined) return 'not_found';
        const [run] = await db
          .select({ id: schema.productionRuns.id })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.productionShiftId, productionShiftId),
            ),
          )
          .limit(1);
        return run === undefined ? 'available' : 'run_exists';
      },
      loadSchedulingInput: async ({
        locationId,
        productionShiftId,
        schedulerConfigId,
      }) => {
        const [shift] = await db
          .select()
          .from(schema.productionShifts)
          .where(
            and(
              eq(schema.productionShifts.locationId, locationId),
              eq(schema.productionShifts.id, productionShiftId),
            ),
          )
          .limit(1);
        const [config] = await db
          .select()
          .from(schema.schedulerConfigs)
          .where(
            and(
              eq(schema.schedulerConfigs.locationId, locationId),
              eq(schema.schedulerConfigs.id, schedulerConfigId),
            ),
          )
          .limit(1);
        if (
          shift === undefined ||
          config === undefined ||
          config.algorithmVersion !== 'fixed-pulse-ffd-v2'
        )
          return null;
        const orderRows = await db
          .select({ order: schema.productionOrders })
          .from(schema.productionShiftSelectedOrders)
          .innerJoin(
            schema.productionOrders,
            and(
              eq(
                schema.productionOrders.id,
                schema.productionShiftSelectedOrders.productionOrderId,
              ),
              eq(
                schema.productionOrders.locationId,
                schema.productionShiftSelectedOrders.locationId,
              ),
            ),
          )
          .where(
            and(
              eq(schema.productionShiftSelectedOrders.locationId, locationId),
              eq(
                schema.productionShiftSelectedOrders.productionShiftId,
                productionShiftId,
              ),
            ),
          )
          .orderBy(asc(schema.productionOrders.id));
        if (orderRows.length === 0) return 'selection_empty';
        if (
          orderRows.some(
            ({ order }) =>
              order.resolutionState !== 'open' ||
              order.operationalStatus !== 'eligible' ||
              order.bagCount === null,
          )
        )
          return 'selection_invalid';
        const demands = await db
          .select()
          .from(schema.orderDemands)
          .where(eq(schema.orderDemands.locationId, locationId));
        const demandById = new Map(demands.map((row) => [row.id, row]));
        const stations = await db
          .select()
          .from(schema.stations)
          .where(eq(schema.stations.locationId, locationId));
        const stationKindById = new Map(
          stations.map((row) => [row.id, row.kind]),
        );
        const machines = await db
          .select()
          .from(schema.machines)
          .where(eq(schema.machines.locationId, locationId))
          .orderBy(asc(schema.machines.id));
        const schedulingInput = {
          orders: orderRows.map(({ order }) => {
            const demand = demandById.get(order.orderDemandId);
            if (demand === undefined)
              throw invariant(
                'production_schedule_order_demand_missing',
                'Order demand not found.',
              );
            if (order.bagCount === null)
              throw invariant(
                'production_schedule_bag_intake_missing',
                'Eligible order is missing bag intake.',
              );
            return {
              id: order.id,
              externalOrderId: demand.displayReference,
              dueAt: iso(order.dueAt),
              priority: order.priority,
              derivedWeightLbs: order.derivedWeightLbs,
              bagCount: order.bagCount,
              version: order.version,
            };
          }),
          machines: machines.flatMap((machine) => {
            const kind = stationKindById.get(machine.stationId);
            return (kind === 'washing' || kind === 'drying') &&
              machine.effectiveCapacityLbs !== null
              ? [
                  {
                    id: machine.id,
                    stationKind: kind,
                    effectiveCapacityLbs: machine.effectiveCapacityLbs,
                    active: machine.isActive,
                  },
                ]
              : [];
          }),
          shift: {
            id: shift.id,
            startsAt: iso(shift.startsAt),
            endsAt: iso(shift.endsAt),
            timezone: shift.timezone,
            effectiveFolderCount: shift.effectiveFolderCount,
            version: shift.version,
          },
          config: {
            id: config.id,
            pulseMinutes: config.pulseMinutes,
            foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
            algorithmVersion: config.algorithmVersion,
            version: config.version,
          },
        } satisfies SchedulingInput;
        return readProductionSchedulingInput(
          writeProductionSchedulingInput(schedulingInput),
        );
      },
      loadCurrentPlan: async (locationId, productionShiftId) => {
        const [row] = await db
          .select({
            scheduleRunId: schema.scheduleRuns.id,
            status: schema.scheduleRuns.status,
          })
          .from(schema.scheduleRuns)
          .where(
            and(
              eq(schema.scheduleRuns.locationId, locationId),
              eq(schema.scheduleRuns.productionShiftId, productionShiftId),
              inArray(schema.scheduleRuns.status, ['draft', 'accepted']),
            ),
          )
          .limit(1)
          .for('update');
        return row ?? null;
      },
      saveSchedule: async ({
        locationId,
        id,
        schedulingInput,
        output,
        initialStatus,
        supersession,
        now,
      }) => {
        const inputSnapshot = writeProductionSchedulingInput(schedulingInput);
        const outputPlan = writeProductionSchedulingOutput(output);
        if (supersession !== null) {
          const rows = await db
            .update(schema.scheduleRuns)
            .set({ status: supersession.lifecycle.state, supersededAt: now })
            .where(
              and(
                eq(schema.scheduleRuns.locationId, locationId),
                eq(schema.scheduleRuns.id, supersession.scheduleRunId),
                eq(schema.scheduleRuns.status, supersession.lifecycle.from),
              ),
            )
            .returning({ id: schema.scheduleRuns.id });
          if (rows.length !== 1) return { kind: 'conflict' };
        }
        const [row] = await db
          .insert(schema.scheduleRuns)
          .values({
            id,
            locationId,
            productionShiftId: schedulingInput.shift.id,
            schedulerConfigId: schedulingInput.config.id,
            status: initialStatus,
            inputSnapshot,
            inputSnapshotHash: output.inputSnapshotHash,
            outputPlan,
            outputPlanHash: output.outputPlanHash,
            algorithmVersion: output.algorithmVersion,
            pulseCapacityLbs: output.pulseCapacityLbs,
            batchCount: output.batchCount,
            makespanMinutes: output.makespanMinutes,
            plannedCompletionAt: new Date(output.plannedCompletionAt),
            warnings: output.warnings,
            createdAt: now,
          })
          .returning({
            id: schema.scheduleRuns.id,
            inputSnapshot: schema.scheduleRuns.inputSnapshot,
            outputPlan: schema.scheduleRuns.outputPlan,
          });
        if (row === undefined)
          throw invariant(
            'production_schedule_insert_return_missing',
            'Schedule insert failed.',
          );
        return {
          kind: 'saved',
          proposal: proposal(
            row.id,
            readProductionSchedulingInput(row.inputSnapshot),
            readProductionSchedulingOutput(row.outputPlan),
            now,
          ),
        };
      },
      appendWorkEvent: (event) =>
        appendCreateScheduleWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unit = deps.observeUnitOfWork?.(native) ?? native;
  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unit.transaction(async (repository) => {
        const cell = await work(repository);
        return cell.kind === 'success'
          ? result.ok(cell.value)
          : result.err(cell.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
