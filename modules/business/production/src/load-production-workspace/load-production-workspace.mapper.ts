import type {
  ProductionBatch,
  ProductionBoard,
  ProductionLocation,
  ProductionMachine,
  ProductionOrderSummary,
  ProductionRunSummary,
  ProductionShift,
  ProductionStation,
  StageRun,
} from '@pressly/contracts';

export type WorkspaceShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
}>;

export type WorkspaceOrderRow = Readonly<{
  id: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  version: number;
}>;

export type WorkspaceRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  version: number;
}>;

export type WorkspaceBatchRow = Readonly<{
  id: string;
  sequenceIndex: number;
  status: string;
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  pulseMinutes: number;
  version: number;
}>;

export type WorkspaceBatchOrderRow = Readonly<{
  productionBatchId: string;
  productionOrderId: string;
}>;

export type WorkspaceStageRow = Readonly<{
  id: string;
  productionBatchId: string;
  stageKind: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  version: number;
}>;

export type WorkspaceAssignmentRow = Readonly<{
  stageRunId: string;
  machineId: string;
}>;

const dueBucket = (
  dueAt: Date,
  now: Date,
): ProductionOrderSummary['dueBucket'] => {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const due = Date.UTC(
    dueAt.getUTCFullYear(),
    dueAt.getUTCMonth(),
    dueAt.getUTCDate(),
  );
  const distance = Math.floor((due - start) / 86_400_000);
  return distance <= 0 ? 'today' : distance === 1 ? 'tomorrow' : 'later';
};

const mapOrder = (
  row: WorkspaceOrderRow,
  now: Date,
): ProductionOrderSummary => {
  if (row.bagCount === null)
    throw new Error('A board order is missing completed bag intake.');

  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket: dueBucket(row.dueAt, now),
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};

const mapBatchStatus = (value: string): ProductionBatch['status'] => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production batch status: ${value}.`);
  }
};

const mapStage = (
  row: WorkspaceStageRow,
  assignments: readonly WorkspaceAssignmentRow[],
): StageRun => {
  if (
    row.stageKind !== 'sorting' &&
    row.stageKind !== 'washing' &&
    row.stageKind !== 'drying' &&
    row.stageKind !== 'folding_packaging'
  )
    throw new Error(`Unknown production stage kind: ${row.stageKind}.`);
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw new Error(`Unknown production stage status: ${row.status}.`);

  return {
    id: row.id,
    productionBatchId: row.productionBatchId,
    stage: row.stageKind,
    status: row.status,
    plannedStartAt: row.plannedStartAt.toISOString(),
    plannedEndAt: row.plannedEndAt.toISOString(),
    actualStartAt: row.actualStartAt?.toISOString() ?? null,
    actualEndAt: row.actualEndAt?.toISOString() ?? null,
    machineIds: assignments
      .filter((assignment) => assignment.stageRunId === row.id)
      .map((assignment) => assignment.machineId),
    allowedActions: [],
    version: row.version,
  };
};

export const selectCurrentWorkspaceShift = <Row extends WorkspaceShiftRow>(
  rows: readonly Row[],
  now: Date,
): Row | null => {
  const newestFirst = [...rows].sort(
    (left, right) => right.startsAt.getTime() - left.startsAt.getTime(),
  );
  const currentOpen = newestFirst.find(
    (shift) =>
      shift.status === 'open' && shift.startsAt <= now && shift.endsAt > now,
  );
  if (currentOpen !== undefined) return currentOpen;

  const anyOpen = newestFirst.find((shift) => shift.status === 'open');
  if (anyOpen !== undefined) return anyOpen;

  const viableDrafts = newestFirst
    .filter((shift) => shift.status === 'draft' && shift.endsAt > now)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  return viableDrafts[0] ?? null;
};

export const mapWorkspaceLocation = (row: {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}): ProductionLocation => ({ ...row });

export const mapWorkspaceShift = (row: WorkspaceShiftRow): ProductionShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw new Error(`Unknown production shift status: ${row.status}.`);
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    effectiveFolderCount: row.effectiveFolderCount,
    status: row.status,
    version: row.version,
  };
};

export const mapWorkspaceStation = (row: {
  id: string;
  locationId: string;
  kind: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}): ProductionStation => {
  if (
    row.kind !== 'sorting' &&
    row.kind !== 'washing' &&
    row.kind !== 'drying' &&
    row.kind !== 'folding_packaging'
  )
    throw new Error(`Unknown production station kind: ${row.kind}.`);
  return { ...row, kind: row.kind };
};

export const mapWorkspaceMachine = (row: {
  id: string;
  stationKind: string;
  label: string;
  effectiveCapacityLbs: number;
  isActive: boolean;
}): ProductionMachine => {
  if (row.stationKind !== 'washing' && row.stationKind !== 'drying')
    throw new Error(`Unknown production machine station: ${row.stationKind}.`);
  return {
    id: row.id,
    stationKind: row.stationKind,
    label: row.label,
    effectiveCapacityLbs: row.effectiveCapacityLbs,
    active: row.isActive,
  };
};

export const mapWorkspaceRun = (row: WorkspaceRunRow): ProductionRunSummary => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw new Error(`Unknown production run status: ${row.status}.`);
  return {
    id: row.id,
    productionShiftId: row.productionShiftId,
    status: row.status,
    version: row.version,
  };
};

export const mapWorkspaceBoard = (input: {
  shift: WorkspaceShiftRow;
  run: WorkspaceRunRow | null;
  orders: readonly WorkspaceOrderRow[];
  batches: readonly WorkspaceBatchRow[];
  batchOrders: readonly WorkspaceBatchOrderRow[];
  stages: readonly WorkspaceStageRow[];
  assignments: readonly WorkspaceAssignmentRow[];
  now: Date;
}): ProductionBoard => {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));

  const batches = input.batches.map((batch): ProductionBatch => {
    const orders = input.batchOrders
      .filter((link) => link.productionBatchId === batch.id)
      .map((link) => {
        const order = orderById.get(link.productionOrderId);
        if (order === undefined)
          throw new Error('A production batch references a missing order.');
        return mapOrder(order, input.now);
      });
    const stages = input.stages
      .filter((stage) => stage.productionBatchId === batch.id)
      .map((stage) => mapStage(stage, input.assignments));

    return {
      id: batch.id,
      sequence: batch.sequenceIndex,
      status: mapBatchStatus(batch.status),
      derivedWeightLbs: batch.derivedWeightLbs,
      pulseCapacityLbs: batch.pulseCapacityLbs,
      pulseMinutes: batch.pulseMinutes,
      orders,
      stages,
      version: batch.version,
    };
  });

  return {
    productionShift: mapWorkspaceShift(input.shift),
    productionRun:
      input.run === null
        ? null
        : {
            id: input.run.id,
            status: mapWorkspaceRun(input.run).status,
            allowedActions: input.run.status === 'planned' ? ['start'] : [],
            version: input.run.version,
          },
    batches,
    eligibleOrders: input.orders
      .filter((order) => order.status === 'eligible' && order.bagCount !== null)
      .map((order) => mapOrder(order, input.now)),
    asOf: input.now.toISOString(),
  };
};
