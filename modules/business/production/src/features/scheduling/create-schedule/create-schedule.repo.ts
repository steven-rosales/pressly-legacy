import { invariantViolationError } from '@pressly/errors/factories';
import { and, asc, eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { CreateScheduleRepository } from './create-schedule.port.ts';
import type { SchedulingInput } from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import {
  asDate,
  iso,
  mapSchedule,
} from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';
import {
  schedulingInputJson,
  schedulingOutputJson,
} from '../../../foundations/adapters/postgres/scheduling/production-schedule-json.persistence.mapper.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeCreateScheduleRepository = (deps: {
  db: Database;
  ids: IdSource;
}): CreateScheduleRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockShiftForPlanning: async (locationId, productionShiftId) => {
      const [shift] = await db
        .select({ id: laundryProduction.productionShifts.id })
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
          ),
        )
        .limit(1)
        .for('update');
      if (shift === undefined) return 'not_found';

      const [run] = await db
        .select({ id: laundryProduction.productionRuns.id })
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(
              laundryProduction.productionRuns.productionShiftId,
              productionShiftId,
            ),
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
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
          ),
        )
        .limit(1);
      const [config] = await db
        .select()
        .from(laundryProduction.schedulerConfigs)
        .where(
          and(
            eq(laundryProduction.schedulerConfigs.locationId, locationId),
            eq(laundryProduction.schedulerConfigs.id, schedulerConfigId),
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
        .select({ order: laundryProduction.productionOrders })
        .from(laundryProduction.productionShiftSelectedOrders)
        .innerJoin(
          laundryProduction.productionOrders,
          and(
            eq(
              laundryProduction.productionOrders.id,
              laundryProduction.productionShiftSelectedOrders.productionOrderId,
            ),
            eq(
              laundryProduction.productionOrders.locationId,
              laundryProduction.productionShiftSelectedOrders.locationId,
            ),
          ),
        )
        .where(
          and(
            eq(
              laundryProduction.productionShiftSelectedOrders.locationId,
              locationId,
            ),
            eq(
              laundryProduction.productionShiftSelectedOrders.productionShiftId,
              productionShiftId,
            ),
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id));
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
      const demandRows = await db
        .select()
        .from(laundryProduction.orderDemands)
        .where(eq(laundryProduction.orderDemands.locationId, locationId));
      const demandById = new Map(demandRows.map((row) => [row.id, row]));
      const stationRows = await db
        .select()
        .from(laundryProduction.stations)
        .where(eq(laundryProduction.stations.locationId, locationId));
      const stationKindById = new Map(
        stationRows.map((row) => [row.id, row.kind]),
      );
      const machineRows = await db
        .select()
        .from(laundryProduction.machines)
        .where(eq(laundryProduction.machines.locationId, locationId))
        .orderBy(asc(laundryProduction.machines.id));

      return {
        orders: orderRows.map(({ order }) => {
          const demand = demandById.get(order.orderDemandId);
          if (demand === undefined)
            throw productionInvariantViolation(
              'production_schedule_order_demand_missing',
              'Order demand not found.',
            );
          if (order.bagCount === null)
            throw productionInvariantViolation(
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
        machines: machineRows.flatMap((machine) => {
          const stationKind = stationKindById.get(machine.stationId);
          return (stationKind === 'washing' || stationKind === 'drying') &&
            machine.effectiveCapacityLbs !== null
            ? [
                {
                  id: machine.id,
                  stationKind,
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
    },

    loadCurrentPlan: async (locationId, productionShiftId) => {
      const [current] = await db
        .select({
          scheduleRunId: laundryProduction.scheduleRuns.id,
          status: laundryProduction.scheduleRuns.status,
        })
        .from(laundryProduction.scheduleRuns)
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(
              laundryProduction.scheduleRuns.productionShiftId,
              productionShiftId,
            ),
            inArray(laundryProduction.scheduleRuns.status, [
              'draft',
              'accepted',
            ]),
          ),
        )
        .limit(1)
        .for('update');
      return current ?? null;
    },

    saveSchedule: async ({
      locationId,
      id,
      schedulingInput,
      output,
      initialStatus,
      supersede,
      now,
    }) => {
      if (supersede !== null) {
        const superseded = await db
          .update(laundryProduction.scheduleRuns)
          .set({ status: supersede.lifecycle.state, supersededAt: now })
          .where(
            and(
              eq(laundryProduction.scheduleRuns.locationId, locationId),
              eq(laundryProduction.scheduleRuns.id, supersede.scheduleRunId),
              eq(
                laundryProduction.scheduleRuns.status,
                supersede.lifecycle.from,
              ),
            ),
          )
          .returning({ id: laundryProduction.scheduleRuns.id });
        if (superseded.length !== 1)
          throw productionConcurrencyConflict(
            'production_schedule_revision_version_conflict',
            'Current schedule revision changed unexpectedly.',
          );
      }

      const inputSnapshot = schedulingInputJson(schedulingInput);
      const outputPlan = schedulingOutputJson(output);

      const [row] = await db
        .insert(laundryProduction.scheduleRuns)
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
          plannedCompletionAt: asDate(output.plannedCompletionAt),
          warnings: output.warnings,
          createdAt: now,
        })
        .returning();
      if (row === undefined)
        throw productionInvariantViolation(
          'production_schedule_insert_return_missing',
          'Schedule insert failed.',
        );
      return mapSchedule(row);
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
