import { productionPendingPlacementSchema } from '@pressly/contracts';
import type {
  ProductionLocation,
  ProductionMachine,
  ProductionOrderSummary,
  ProductionPendingOrder,
  ProductionPendingPlacement,
  ProductionRunSummary,
  ProductionShift,
  ProductionStation,
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
  locationId?: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource?: string | null;
  intakeVersion?: number;
  pendingPlacement?: unknown;
  version: number;
}>;

export type WorkspaceRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: Date | null;
  version: number;
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

const defaultPendingPlacement = (
  activeProductionRunIds: readonly string[],
): ProductionPendingPlacement => {
  if (activeProductionRunIds.length > 1)
    return {
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [...activeProductionRunIds].sort(),
    };
  if (activeProductionRunIds.length === 0)
    return {
      status: 'awaiting_run',
      reason: 'no_started_run',
      message: 'This order is waiting for a production run to start.',
    };
  return {
    status: 'awaiting_run',
    reason: 'automatic_placement_not_attempted',
    message: 'Automatic placement has not completed; it can be retried.',
  };
};

export const mapWorkspacePendingOrder = (
  row: WorkspaceOrderRow,
  now: Date,
  activeProductionRunIds: readonly string[],
): ProductionPendingOrder => {
  const parsed = productionPendingPlacementSchema.safeParse(
    row.pendingPlacement,
  );
  if (row.pendingPlacement != null && !parsed.success)
    throw new Error('An eligible order has invalid pending placement state.');
  return {
    ...mapOrder(row, now),
    placement:
      parsed.success &&
      parsed.data.status !== 'awaiting_run' &&
      parsed.data.status !== 'ambiguous_run'
        ? parsed.data
        : defaultPendingPlacement(activeProductionRunIds),
  };
};

export const isActionableWorkspaceSchedule = (input: {
  schedule: Readonly<{ id: string; status: string }>;
  shift: WorkspaceShiftRow | undefined;
  committedScheduleRunIds: ReadonlySet<string>;
  now: Date;
}): boolean =>
  input.shift !== undefined &&
  input.shift.status === 'open' &&
  input.shift.endsAt > input.now &&
  (input.schedule.status === 'draft' || input.schedule.status === 'accepted') &&
  !input.committedScheduleRunIds.has(input.schedule.id);

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
    queueVersion: row.queueVersion,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
    overtimeAcknowledgement:
      row.overtimeProposalHash === null ||
      row.overtimeQueueVersion === null ||
      row.overtimeAcknowledgedBy === null ||
      row.overtimeAcknowledgedAt === null
        ? null
        : {
            proposalHash: row.overtimeProposalHash,
            queueVersion: row.overtimeQueueVersion,
            acknowledgedBy: row.overtimeAcknowledgedBy,
            acknowledgedAt: row.overtimeAcknowledgedAt.toISOString(),
          },
    version: row.version,
  };
};
