import {
  and,
  asc,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { CreateScheduleRepository } from './create-schedule.port.ts';
import type { SchedulingInput } from '../production.port.ts';
import { asDate, iso, mapSchedule } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';

export const makeCreateScheduleRepository = (deps: {
  db: Database;
}): CreateScheduleRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    loadSchedulingInput: async ({
      locationId,
      productionShiftId,
      schedulerConfigId,
      horizonEnd,
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
      if (shift === undefined || config === undefined) return null;

      const orderRows = await db
        .select()
        .from(laundryProduction.productionOrders)
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.status, 'eligible'),
            sql`${laundryProduction.productionOrders.bagCount} is not null`,
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id));
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
        orders: orderRows.map((order) => {
          const demand = demandById.get(order.orderDemandId);
          if (demand === undefined) throw new Error('Order demand not found.');
          if (order.bagCount === null)
            throw new Error('Eligible order is missing bag intake.');
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
          algorithmVersion: 'fixed-pulse-ffd-v1',
          version: config.version,
        },
        horizonEnd,
      } satisfies SchedulingInput;
    },

    saveSchedule: async ({ locationId, id, schedulingInput, output, now }) => {
      const [existing] = await db
        .select()
        .from(laundryProduction.scheduleRuns)
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(
              laundryProduction.scheduleRuns.productionShiftId,
              schedulingInput.shift.id,
            ),
            eq(
              laundryProduction.scheduleRuns.schedulerConfigId,
              schedulingInput.config.id,
            ),
            eq(
              laundryProduction.scheduleRuns.inputSnapshotHash,
              output.inputSnapshotHash,
            ),
            eq(
              laundryProduction.scheduleRuns.outputPlanHash,
              output.outputPlanHash,
            ),
          ),
        )
        .limit(1);
      if (existing !== undefined) return mapSchedule(existing);

      const [row] = await db
        .insert(laundryProduction.scheduleRuns)
        .values({
          id,
          locationId,
          productionShiftId: schedulingInput.shift.id,
          schedulerConfigId: schedulingInput.config.id,
          status: 'draft',
          inputSnapshot: schedulingInput,
          inputSnapshotHash: output.inputSnapshotHash,
          outputPlan: output,
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
      if (row === undefined) throw new Error('Schedule insert failed.');
      return mapSchedule(row);
    },
  }));
