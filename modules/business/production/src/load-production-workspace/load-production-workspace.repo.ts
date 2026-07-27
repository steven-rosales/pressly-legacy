import type { ProductionWorkspace } from '@pressly/contracts';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  laundryProduction,
  ne,
  or,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { mapConfig, mapSchedule } from '../persistence/production-mappers.ts';
import { mapProductionOrderListItem } from '../persistence/production-board-projection.ts';
import { loadProductionBoardProjection } from '../persistence/production-board-read.ts';
import {
  loadProductionRunPlacementContext,
  makeProductionOrderPlacementContext,
} from '../persistence/production-order-placement-context.ts';
import {
  isActionableWorkspaceSchedule,
  mapWorkspaceLocation,
  mapWorkspaceMachine,
  mapWorkspacePendingOrder,
  mapWorkspaceRun,
  mapWorkspaceShift,
  mapWorkspaceStation,
} from './load-production-workspace.mapper.ts';
import type { LoadProductionWorkspaceRepository } from './load-production-workspace.port.ts';
import type { ProductionWorkspaceReadModel } from './load-production-workspace.port.ts';

const loadWorkspace = async (
  db: DatabaseExecutor,
  locationId: string,
  requestedShiftId: string | undefined,
  now: Date,
): Promise<ProductionWorkspaceReadModel | 'shift_not_found' | null> => {
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

  const [shiftRows, runRows, currentScheduleRows] = await Promise.all([
    db
      .select()
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.locationId, locationId))
      .orderBy(desc(laundryProduction.productionShifts.startsAt)),
    db
      .select()
      .from(laundryProduction.productionRuns)
      .where(eq(laundryProduction.productionRuns.locationId, locationId))
      .orderBy(desc(laundryProduction.productionRuns.createdAt)),
    db
      .select()
      .from(laundryProduction.scheduleRuns)
      .where(
        and(
          eq(laundryProduction.scheduleRuns.locationId, locationId),
          inArray(laundryProduction.scheduleRuns.status, ['draft', 'accepted']),
        ),
      )
      .orderBy(desc(laundryProduction.scheduleRuns.createdAt)),
  ]);
  const activeRunRows = runRows.filter((run) => run.status === 'started');

  const shiftById = new Map(shiftRows.map((shift) => [shift.id, shift]));
  const committedScheduleRunIds = new Set(
    runRows.map((run) => run.scheduleRunId),
  );
  const actionableScheduleRows = currentScheduleRows.filter((schedule) =>
    isActionableWorkspaceSchedule({
      schedule,
      shift: shiftById.get(schedule.productionShiftId),
      committedScheduleRunIds,
      now,
    }),
  );
  const runShiftIds = new Set(runRows.map((run) => run.productionShiftId));
  const candidateShifts: ProductionWorkspace['candidateShifts'] = [];
  let currentShift =
    requestedShiftId === undefined
      ? undefined
      : shiftById.get(requestedShiftId);

  if (requestedShiftId !== undefined && currentShift === undefined)
    return 'shift_not_found';

  if (requestedShiftId === undefined) {
    const startedCandidates = activeRunRows.flatMap((run) => {
      const shift = shiftById.get(run.productionShiftId);
      return shift === undefined ? [] : [{ shift, run }];
    });

    if (startedCandidates.length === 1)
      currentShift = startedCandidates[0]?.shift;
    else if (startedCandidates.length > 1)
      for (const { shift, run } of startedCandidates)
        candidateShifts.push({
          productionShiftId: shift.id,
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
          reason: 'started_run',
          productionRunId: run.id,
          scheduleRunId: run.scheduleRunId,
        });
    else {
      const acceptedCandidates = actionableScheduleRows.flatMap((schedule) => {
        if (schedule.status !== 'accepted') return [];
        const shift = shiftById.get(schedule.productionShiftId);
        return shift === undefined ? [] : [{ shift, schedule }];
      });

      if (acceptedCandidates.length === 1)
        currentShift = acceptedCandidates[0]?.shift;
      else if (acceptedCandidates.length > 1)
        for (const { shift, schedule } of acceptedCandidates)
          candidateShifts.push({
            productionShiftId: shift.id,
            startsAt: shift.startsAt.toISOString(),
            endsAt: shift.endsAt.toISOString(),
            reason: 'accepted_plan',
            productionRunId: null,
            scheduleRunId: schedule.id,
          });
      else {
        const openCandidates = shiftRows.filter(
          (shift) =>
            shift.status === 'open' &&
            shift.endsAt > now &&
            !runShiftIds.has(shift.id),
        );
        if (openCandidates.length === 1) currentShift = openCandidates[0];
        else if (openCandidates.length > 1)
          for (const shift of openCandidates)
            candidateShifts.push({
              productionShiftId: shift.id,
              startsAt: shift.startsAt.toISOString(),
              endsAt: shift.endsAt.toISOString(),
              reason: 'open_shift',
              productionRunId: null,
              scheduleRunId:
                actionableScheduleRows.find(
                  (schedule) => schedule.productionShiftId === shift.id,
                )?.id ?? null,
            });
      }
    }
  }

  const [configRow, stationRows, machineRows] = await Promise.all([
    db
      .select()
      .from(laundryProduction.schedulerConfigs)
      .where(eq(laundryProduction.schedulerConfigs.locationId, locationId))
      .orderBy(
        desc(laundryProduction.schedulerConfigs.version),
        desc(laundryProduction.schedulerConfigs.publishedAt),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(laundryProduction.stations)
      .where(eq(laundryProduction.stations.locationId, locationId))
      .orderBy(
        asc(laundryProduction.stations.sortOrder),
        asc(laundryProduction.stations.id),
      ),
    db
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
          eq(
            laundryProduction.stations.id,
            laundryProduction.machines.stationId,
          ),
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
      ),
  ]);

  const selectedSchedule =
    currentShift === undefined
      ? undefined
      : actionableScheduleRows.find(
          (schedule) => schedule.productionShiftId === currentShift.id,
        );
  const selectedRun =
    currentShift === undefined
      ? undefined
      : runRows.find((run) => run.productionShiftId === currentShift.id);
  const shiftSelection =
    currentShift === undefined
      ? null
      : await Promise.all([
          db
            .select({
              version: laundryProduction.productionShiftSelections.version,
            })
            .from(laundryProduction.productionShiftSelections)
            .where(
              and(
                eq(
                  laundryProduction.productionShiftSelections.productionShiftId,
                  currentShift.id,
                ),
                eq(
                  laundryProduction.productionShiftSelections.locationId,
                  locationId,
                ),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
          db
            .select({
              productionOrderId:
                laundryProduction.productionShiftSelectedOrders
                  .productionOrderId,
            })
            .from(laundryProduction.productionShiftSelectedOrders)
            .where(
              and(
                eq(
                  laundryProduction.productionShiftSelectedOrders
                    .productionShiftId,
                  currentShift.id,
                ),
                eq(
                  laundryProduction.productionShiftSelectedOrders.locationId,
                  locationId,
                ),
              ),
            )
            .orderBy(
              asc(
                laundryProduction.productionShiftSelectedOrders
                  .productionOrderId,
              ),
            ),
        ]).then(([selection, selectedOrders]) => ({
          productionShiftId: currentShift.id,
          version: selection?.version ?? 0,
          selectedOrderIds: selectedOrders.map(
            (order) => order.productionOrderId,
          ),
        }));

  const orderRows = await db
    .select({
      id: laundryProduction.productionOrders.id,
      locationId: laundryProduction.productionOrders.locationId,
      orderDemandId: laundryProduction.productionOrders.orderDemandId,
      externalOrderId: laundryProduction.orderDemands.displayReference,
      dueAt: laundryProduction.productionOrders.dueAt,
      priority: laundryProduction.productionOrders.priority,
      status: laundryProduction.productionOrders.operationalStatus,
      executionStatus: laundryProduction.productionOrders.executionStatus,
      derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
      bagCount: laundryProduction.productionOrders.bagCount,
      bagCountSource: laundryProduction.productionOrders.bagCountSource,
      intakeVersion: laundryProduction.productionOrders.intakeVersion,
      pendingPlacement: laundryProduction.productionOrders.pendingPlacement,
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
    .where(
      and(
        eq(laundryProduction.productionOrders.locationId, locationId),
        eq(laundryProduction.productionOrders.resolutionState, 'open'),
        ne(laundryProduction.productionOrders.executionStatus, 'finished'),
      ),
    );
  const demandOutlookRows = (
    await db
      .select({
        orderDemandId: laundryProduction.orderDemands.id,
        productionOrderId: laundryProduction.productionOrders.id,
        externalOrderId: laundryProduction.orderDemands.displayReference,
        phase: laundryProduction.orderDemands.phase,
        dueAt: laundryProduction.orderDemands.dueAt,
        estimatedWeightLbs: laundryProduction.orderDemands.estimatedWeightLbs,
        priority: laundryProduction.productionOrders.priority,
        productionStatus: laundryProduction.productionOrders.operationalStatus,
        bagCount: laundryProduction.productionOrders.bagCount,
      })
      .from(laundryProduction.orderDemands)
      .leftJoin(
        laundryProduction.productionOrders,
        and(
          eq(
            laundryProduction.productionOrders.orderDemandId,
            laundryProduction.orderDemands.id,
          ),
          eq(
            laundryProduction.productionOrders.locationId,
            laundryProduction.orderDemands.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.orderDemands.locationId, locationId),
          or(
            isNull(laundryProduction.productionOrders.id),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        ),
      )
  ).map((row) => ({ ...row, priority: row.priority ?? false }));
  const activeProductionRunIds = activeRunRows.map((run) => run.id);
  const pendingEligibleOrders = orderRows
    .filter((order) => order.status === 'eligible' && order.bagCount !== null)
    .map((order) =>
      mapWorkspacePendingOrder(
        order,
        now,
        location.timezone,
        activeProductionRunIds,
      ),
    );
  const pendingEligibleOrderIds = pendingEligibleOrders.map(
    (order) => order.id,
  );
  const orderRowById = new Map(orderRows.map((order) => [order.id, order]));
  const assignedPendingOrderIds =
    pendingEligibleOrderIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
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
                  inArray(
                    laundryProduction.productionBatchOrders.productionOrderId,
                    pendingEligibleOrderIds,
                  ),
                  eq(laundryProduction.productionBatchOrders.active, true),
                ),
              )
          ).map((membership) => membership.productionOrderId),
        );

  const boardProjection =
    currentShift === undefined || selectedRun === undefined
      ? null
      : await loadProductionBoardProjection(
          db,
          locationId,
          selectedRun.id,
          now,
        );
  const livePlacementRunContext =
    selectedRun?.status === 'started'
      ? await loadProductionRunPlacementContext(
          db,
          locationId,
          selectedRun,
          false,
        )
      : null;
  const livePlacement =
    livePlacementRunContext === null
      ? null
      : {
          runContext: livePlacementRunContext,
          orders: pendingEligibleOrders.flatMap((order) => {
            const row = orderRowById.get(order.id);
            if (row === undefined) return [];
            const context = makeProductionOrderPlacementContext(
              livePlacementRunContext,
              {
                id: row.id,
                priority: row.priority,
                derivedWeightLbs: row.derivedWeightLbs,
                bagCount: row.bagCount,
                operationalStatus: row.status,
                executionStatus: row.executionStatus,
                version: row.version,
              },
              assignedPendingOrderIds.has(row.id),
            );
            return context === null ? [] : [{ order, context }];
          }),
        };

  return {
    workspace: {
      location: mapWorkspaceLocation(location),
      currentShift:
        currentShift === undefined ? null : mapWorkspaceShift(currentShift),
      shiftSelection,
      candidateShifts,
      currentSchedulerConfig:
        configRow === undefined ? null : mapConfig(configRow),
      currentScheduleProposal:
        selectedSchedule === undefined ? null : mapSchedule(selectedSchedule),
      activeRuns: activeRunRows.map(mapWorkspaceRun),
      orders: orderRows.map((order) =>
        mapProductionOrderListItem(order, now, location.timezone),
      ),
      pendingEligibleOrders,
      liveRunChanges: null,
      demandOutlook: null,
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
    },
    boardProjection,
    demandOutlookRows,
    livePlacement,
  };
};

export const makeLoadProductionWorkspaceRepository = (
  db: Database,
): LoadProductionWorkspaceRepository => ({
  loadWorkspace: (locationId, shiftId, now) =>
    db.transaction(
      (transaction) => loadWorkspace(transaction, locationId, shiftId, now),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
});
