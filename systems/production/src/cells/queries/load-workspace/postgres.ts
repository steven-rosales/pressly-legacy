import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
} from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { loadProductionBoardSnapshot } from '../../../read-models/production-board/postgres.ts';
import { projectBoardOrderListItem } from '../../../read-models/production-board/project.ts';
import type { LoadWorkspaceRepository, WorkspaceReadModel } from './execute.ts';
import {
  loadRunPlacementContext,
  makeOrderPlacementContext,
} from './placement.postgres.ts';
import {
  projectWorkspaceConfig,
  projectWorkspaceLocation,
  projectWorkspaceMachine,
  projectWorkspacePendingOrder,
  projectWorkspaceRun,
  projectWorkspaceSchedule,
  projectWorkspaceShift,
  projectWorkspaceStation,
} from './project.ts';
import { selectWorkspaceShift } from './selection.ts';

const loadWorkspaceSnapshot = async (
  database: PostgresExecutor,
  locationId: string,
  requestedShiftId: string | undefined,
  asOf: Date,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<WorkspaceReadModel | 'shift_not_found' | null> => {
  const location = await productionScopeReconciliationV1.load({ locationId });
  if (location?.isActive !== true) return null;

  const [shiftRows, runRows, currentScheduleRows] = await Promise.all([
    database
      .select()
      .from(schema.productionShifts)
      .where(eq(schema.productionShifts.locationId, locationId))
      .orderBy(desc(schema.productionShifts.startsAt)),
    database
      .select()
      .from(schema.productionRuns)
      .where(eq(schema.productionRuns.locationId, locationId))
      .orderBy(desc(schema.productionRuns.createdAt)),
    database
      .select()
      .from(schema.scheduleRuns)
      .where(
        and(
          eq(schema.scheduleRuns.locationId, locationId),
          inArray(schema.scheduleRuns.status, ['draft', 'accepted']),
        ),
      )
      .orderBy(desc(schema.scheduleRuns.createdAt)),
  ]);
  const selection = selectWorkspaceShift({
    requestedShiftId,
    shiftRows,
    runRows,
    currentScheduleRows,
    now: asOf,
  });
  if (selection === 'shift_not_found') return selection;
  const {
    currentShift,
    candidateShifts,
    activeRunRows,
    actionableScheduleRows,
  } = selection;

  const [configRow, stationRows, machineRows] = await Promise.all([
    database
      .select()
      .from(schema.schedulerConfigs)
      .where(eq(schema.schedulerConfigs.locationId, locationId))
      .orderBy(
        desc(schema.schedulerConfigs.version),
        desc(schema.schedulerConfigs.publishedAt),
      )
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.locationId, locationId))
      .orderBy(asc(schema.stations.sortOrder), asc(schema.stations.id)),
    database
      .select({
        id: schema.machines.id,
        stationKind: schema.stations.kind,
        label: schema.machines.label,
        effectiveCapacityLbs: schema.machines.effectiveCapacityLbs,
        isActive: schema.machines.isActive,
      })
      .from(schema.machines)
      .innerJoin(
        schema.stations,
        and(
          eq(schema.stations.id, schema.machines.stationId),
          eq(schema.stations.locationId, schema.machines.locationId),
        ),
      )
      .where(eq(schema.machines.locationId, locationId))
      .orderBy(asc(schema.stations.sortOrder), asc(schema.machines.label)),
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
          database
            .select({ version: schema.productionShiftSelections.version })
            .from(schema.productionShiftSelections)
            .where(
              and(
                eq(
                  schema.productionShiftSelections.productionShiftId,
                  currentShift.id,
                ),
                eq(schema.productionShiftSelections.locationId, locationId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]),
          database
            .select({
              productionOrderId:
                schema.productionShiftSelectedOrders.productionOrderId,
            })
            .from(schema.productionShiftSelectedOrders)
            .where(
              and(
                eq(
                  schema.productionShiftSelectedOrders.productionShiftId,
                  currentShift.id,
                ),
                eq(schema.productionShiftSelectedOrders.locationId, locationId),
              ),
            )
            .orderBy(
              asc(schema.productionShiftSelectedOrders.productionOrderId),
            ),
        ]).then(([storedSelection, selectedOrders]) => ({
          productionShiftId: currentShift.id,
          version: storedSelection?.version ?? 0,
          selectedOrderIds: selectedOrders.map(
            (order) => order.productionOrderId,
          ),
        }));

  // Preserve current query behavior: this query deliberately has no
  // orderBy. Workspace and pending arrays retain repository-return order.
  const orderRows = await database
    .select({
      id: schema.productionOrders.id,
      locationId: schema.productionOrders.locationId,
      orderDemandId: schema.productionOrders.orderDemandId,
      externalOrderId: schema.orderDemands.displayReference,
      dueAt: schema.productionOrders.dueAt,
      priority: schema.productionOrders.priority,
      status: schema.productionOrders.operationalStatus,
      executionStatus: schema.productionOrders.executionStatus,
      derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
      bagCount: schema.productionOrders.bagCount,
      bagCountSource: schema.productionOrders.bagCountSource,
      intakeVersion: schema.productionOrders.intakeVersion,
      pendingPlacement: schema.productionOrders.pendingPlacement,
      version: schema.productionOrders.version,
    })
    .from(schema.productionOrders)
    .innerJoin(
      schema.orderDemands,
      and(
        eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
        eq(schema.orderDemands.locationId, schema.productionOrders.locationId),
      ),
    )
    .where(
      and(
        eq(schema.productionOrders.locationId, locationId),
        eq(schema.productionOrders.resolutionState, 'open'),
        ne(schema.productionOrders.executionStatus, 'finished'),
      ),
    );
  const demandOutlookRows = (
    await database
      .select({
        orderDemandId: schema.orderDemands.id,
        productionOrderId: schema.productionOrders.id,
        externalOrderId: schema.orderDemands.displayReference,
        phase: schema.orderDemands.phase,
        dueAt: schema.orderDemands.dueAt,
        estimatedWeightLbs: schema.orderDemands.estimatedWeightLbs,
        priority: schema.productionOrders.priority,
        productionStatus: schema.productionOrders.operationalStatus,
        bagCount: schema.productionOrders.bagCount,
      })
      .from(schema.orderDemands)
      .leftJoin(
        schema.productionOrders,
        and(
          eq(schema.productionOrders.orderDemandId, schema.orderDemands.id),
          eq(
            schema.productionOrders.locationId,
            schema.orderDemands.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.orderDemands.locationId, locationId),
          or(
            isNull(schema.productionOrders.id),
            eq(schema.productionOrders.resolutionState, 'open'),
          ),
        ),
      )
  ).map((row) => ({ ...row, priority: row.priority ?? false }));
  const activeProductionRunIds = activeRunRows.map((run) => run.id);
  const projectedOrders = orderRows.map((order) => ({
    order,
    projected: projectBoardOrderListItem(order, asOf, location.timezone),
  }));
  const pendingEligibleOrders = projectedOrders
    .filter(
      ({ order }) => order.status === 'eligible' && order.bagCount !== null,
    )
    .map(({ order, projected }) =>
      projectWorkspacePendingOrder(
        order,
        projected.dueBucket,
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
            await database
              .select({
                productionOrderId:
                  schema.productionBatchOrders.productionOrderId,
              })
              .from(schema.productionBatchOrders)
              .where(
                and(
                  eq(schema.productionBatchOrders.locationId, locationId),
                  inArray(
                    schema.productionBatchOrders.productionOrderId,
                    pendingEligibleOrderIds,
                  ),
                  eq(schema.productionBatchOrders.active, true),
                ),
              )
          ).map((membership) => membership.productionOrderId),
        );

  const boardProjection =
    currentShift === undefined || selectedRun === undefined
      ? null
      : await loadProductionBoardSnapshot(
          database,
          locationId,
          selectedRun.id,
          asOf,
          schema,
        );
  const livePlacementRunContext =
    selectedRun?.status === 'started'
      ? await loadRunPlacementContext(database, locationId, selectedRun, schema)
      : null;
  const livePlacement =
    livePlacementRunContext === null
      ? null
      : {
          runContext: livePlacementRunContext,
          orders: pendingEligibleOrders.flatMap((order) => {
            const row = orderRowById.get(order.id);
            if (row === undefined) return [];
            const context = makeOrderPlacementContext(
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
      location: projectWorkspaceLocation(location),
      currentShift:
        currentShift === undefined ? null : projectWorkspaceShift(currentShift),
      shiftSelection,
      candidateShifts,
      currentSchedulerConfig:
        configRow === undefined ? null : projectWorkspaceConfig(configRow),
      currentScheduleProposal:
        selectedSchedule === undefined
          ? null
          : projectWorkspaceSchedule(selectedSchedule),
      activeRuns: activeRunRows.map(projectWorkspaceRun),
      orders: projectedOrders.map(({ projected }) => projected),
      pendingEligibleOrders,
      liveRunChanges: null,
      demandOutlook: null,
      board: null,
      stations: stationRows.map(projectWorkspaceStation),
      machines: machineRows.flatMap((machine) =>
        machine.effectiveCapacityLbs === null ||
        (machine.stationKind !== 'washing' && machine.stationKind !== 'drying')
          ? []
          : [
              projectWorkspaceMachine({
                ...machine,
                effectiveCapacityLbs: machine.effectiveCapacityLbs,
              }),
            ],
      ),
      asOf,
    },
    boardProjection,
    demandOutlookRows,
    livePlacement,
  };
};

export const makeLoadWorkspacePostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): LoadWorkspaceRepository => ({
  load: (locationId, shiftId, asOf) =>
    database.transaction(
      (transaction) =>
        loadWorkspaceSnapshot(
          transaction,
          locationId,
          shiftId,
          asOf,
          schema,
          productionScopeReconciliationV1,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
});
