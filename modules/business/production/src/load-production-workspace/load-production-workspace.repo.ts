import type { ProductionWorkspace } from '@pressly/contracts';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { mapConfig, mapSchedule } from '../persistence/production-mappers.ts';
import {
  mapWorkspaceBoard,
  mapWorkspaceLocation,
  mapWorkspaceMachine,
  mapWorkspaceRun,
  mapWorkspaceShift,
  mapWorkspaceStation,
  selectCurrentWorkspaceShift,
} from './load-production-workspace.mapper.ts';
import type { LoadProductionWorkspaceRepository } from './load-production-workspace.port.ts';

const loadWorkspace = async (
  db: DatabaseExecutor,
  locationId: string,
  now: Date,
): Promise<ProductionWorkspace | null> => {
  const [location] = await db
    .select({
      id: laundryProduction.productionLocations.id,
      name: laundryProduction.productionLocations.name,
      timezone: laundryProduction.productionLocations.timezone,
      isActive: laundryProduction.productionLocations.isActive,
    })
    .from(laundryProduction.productionLocations)
    .where(
      and(
        eq(laundryProduction.productionLocations.id, locationId),
        eq(laundryProduction.productionLocations.isActive, true),
      ),
    )
    .limit(1);
  if (location === undefined) return null;

  const shiftRows = await db
    .select()
    .from(laundryProduction.productionShifts)
    .where(
      and(
        eq(laundryProduction.productionShifts.locationId, locationId),
        inArray(laundryProduction.productionShifts.status, ['open', 'draft']),
      ),
    )
    .orderBy(desc(laundryProduction.productionShifts.startsAt));
  const currentShift = selectCurrentWorkspaceShift(shiftRows, now);

  const [configRow] = await db
    .select()
    .from(laundryProduction.schedulerConfigs)
    .where(eq(laundryProduction.schedulerConfigs.locationId, locationId))
    .orderBy(
      desc(laundryProduction.schedulerConfigs.version),
      desc(laundryProduction.schedulerConfigs.publishedAt),
    )
    .limit(1);

  const stationRows = await db
    .select()
    .from(laundryProduction.stations)
    .where(eq(laundryProduction.stations.locationId, locationId))
    .orderBy(
      asc(laundryProduction.stations.sortOrder),
      asc(laundryProduction.stations.id),
    );

  const machineRows = await db
    .select({
      id: laundryProduction.machines.id,
      stationKind: laundryProduction.stations.kind,
      label: laundryProduction.machines.label,
      effectiveCapacityLbs: laundryProduction.machines.effectiveCapacityLbs,
      isActive: laundryProduction.machines.isActive,
    })
    .from(laundryProduction.machines)
    .innerJoin(
      laundryProduction.stations,
      and(
        eq(laundryProduction.stations.id, laundryProduction.machines.stationId),
        eq(
          laundryProduction.stations.locationId,
          laundryProduction.machines.locationId,
        ),
      ),
    )
    .where(eq(laundryProduction.machines.locationId, locationId))
    .orderBy(
      asc(laundryProduction.stations.sortOrder),
      asc(laundryProduction.machines.label),
    );

  if (currentShift === null)
    return {
      location: mapWorkspaceLocation(location),
      currentShift: null,
      currentSchedulerConfig:
        configRow === undefined ? null : mapConfig(configRow),
      latestScheduleProposal: null,
      activeRun: null,
      board: null,
      stations: stationRows.map(mapWorkspaceStation),
      machines: machineRows.flatMap((machine) =>
        machine.effectiveCapacityLbs === null ||
        (machine.stationKind !== 'washing' && machine.stationKind !== 'drying')
          ? []
          : [
              mapWorkspaceMachine({
                ...machine,
                effectiveCapacityLbs: machine.effectiveCapacityLbs,
              }),
            ],
      ),
      asOf: now.toISOString(),
    };

  const [scheduleRow] = await db
    .select()
    .from(laundryProduction.scheduleRuns)
    .where(
      and(
        eq(laundryProduction.scheduleRuns.locationId, locationId),
        eq(laundryProduction.scheduleRuns.productionShiftId, currentShift.id),
      ),
    )
    .orderBy(desc(laundryProduction.scheduleRuns.createdAt))
    .limit(1);

  const [runRow] = await db
    .select()
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.productionShiftId, currentShift.id),
        inArray(laundryProduction.productionRuns.status, [
          'planned',
          'started',
        ]),
      ),
    )
    .orderBy(desc(laundryProduction.productionRuns.createdAt))
    .limit(1);

  const orderRows = await db
    .select({
      id: laundryProduction.productionOrders.id,
      orderDemandId: laundryProduction.productionOrders.orderDemandId,
      externalOrderId: laundryProduction.orderDemands.displayReference,
      dueAt: laundryProduction.productionOrders.dueAt,
      priority: laundryProduction.productionOrders.priority,
      status: laundryProduction.productionOrders.status,
      derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
      bagCount: laundryProduction.productionOrders.bagCount,
      version: laundryProduction.productionOrders.version,
    })
    .from(laundryProduction.productionOrders)
    .innerJoin(
      laundryProduction.orderDemands,
      and(
        eq(
          laundryProduction.orderDemands.id,
          laundryProduction.productionOrders.orderDemandId,
        ),
        eq(
          laundryProduction.orderDemands.locationId,
          laundryProduction.productionOrders.locationId,
        ),
      ),
    )
    .where(eq(laundryProduction.productionOrders.locationId, locationId));

  const batchRows =
    runRow === undefined
      ? []
      : await db
          .select()
          .from(laundryProduction.productionBatches)
          .where(
            and(
              eq(laundryProduction.productionBatches.locationId, locationId),
              eq(
                laundryProduction.productionBatches.productionRunId,
                runRow.id,
              ),
            ),
          )
          .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));

  const batchIds = batchRows.map((batch) => batch.id);
  const batchOrderRows =
    batchIds.length === 0
      ? []
      : await db
          .select({
            productionBatchId:
              laundryProduction.productionBatchOrders.productionBatchId,
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
              inArray(
                laundryProduction.productionBatchOrders.productionBatchId,
                batchIds,
              ),
            ),
          );

  const stageRows =
    batchIds.length === 0
      ? []
      : await db
          .select()
          .from(laundryProduction.stageRuns)
          .where(
            and(
              eq(laundryProduction.stageRuns.locationId, locationId),
              inArray(laundryProduction.stageRuns.productionBatchId, batchIds),
            ),
          )
          .orderBy(asc(laundryProduction.stageRuns.plannedStartAt));

  const stageIds = stageRows.map((stage) => stage.id);
  const assignmentRows =
    stageIds.length === 0
      ? []
      : await db
          .select({
            stageRunId: laundryProduction.stageMachineAssignments.stageRunId,
            machineId: laundryProduction.stageMachineAssignments.machineId,
          })
          .from(laundryProduction.stageMachineAssignments)
          .where(
            and(
              eq(
                laundryProduction.stageMachineAssignments.locationId,
                locationId,
              ),
              inArray(
                laundryProduction.stageMachineAssignments.stageRunId,
                stageIds,
              ),
            ),
          );

  const run = runRow === undefined ? null : mapWorkspaceRun(runRow);

  return {
    location: mapWorkspaceLocation(location),
    currentShift: mapWorkspaceShift(currentShift),
    currentSchedulerConfig:
      configRow === undefined ? null : mapConfig(configRow),
    latestScheduleProposal:
      scheduleRow === undefined ? null : mapSchedule(scheduleRow),
    activeRun: run,
    board: mapWorkspaceBoard({
      shift: currentShift,
      run: runRow ?? null,
      orders: orderRows,
      batches: batchRows,
      batchOrders: batchOrderRows,
      stages: stageRows,
      assignments: assignmentRows,
      now,
    }),
    stations: stationRows.map(mapWorkspaceStation),
    machines: machineRows.flatMap((machine) =>
      machine.effectiveCapacityLbs === null ||
      (machine.stationKind !== 'washing' && machine.stationKind !== 'drying')
        ? []
        : [
            mapWorkspaceMachine({
              ...machine,
              effectiveCapacityLbs: machine.effectiveCapacityLbs,
            }),
          ],
    ),
    asOf: now.toISOString(),
  };
};

export const makeLoadProductionWorkspaceRepository = (
  db: Database,
): LoadProductionWorkspaceRepository => ({
  loadWorkspace: (locationId, now) =>
    db.transaction((transaction) =>
      loadWorkspace(transaction, locationId, now),
    ),
});
