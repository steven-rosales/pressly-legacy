import { isJsonObject, type JsonValue } from '@pressly/codec';
import {
  productionPendingPlacementSchema,
  type ProductionWorkspace as ProductionWorkspaceResult,
} from '../../../read-models/production-board/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ProductionBoard } from '../../../read-models/production-board/model.ts';
import { serializeBoard } from '../../../read-models/production-board/project.ts';
import type {
  DemandOutlook,
  LiveAutomaticPlacement,
  LiveExactBatchTarget,
  LiveRunChanges,
  PendingPlacement,
  WorkspaceBaseModel,
  WorkspaceLocation,
  WorkspaceMachine,
  WorkspaceOrderRow,
  WorkspacePendingOrder,
  WorkspaceRun,
  WorkspaceRunRow,
  WorkspaceScheduleRow,
  WorkspaceScheduleProposal,
  WorkspaceSchedulerConfig,
  WorkspaceSchedulerConfigRow,
  WorkspaceShift,
  WorkspaceShiftRow,
  WorkspaceStation,
} from './types.ts';

const productionInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const invalidStoredScheduleField = (field: string): never => {
  throw invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

const isString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string';
const isNumber = (value: JsonValue | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: JsonValue | undefined): value is boolean =>
  typeof value === 'boolean';
const isStringArray = (
  value: JsonValue | undefined,
): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

type SchedulingStage =
  WorkspaceScheduleProposal['batches'][number]['stages'][number];
type SchedulingBatch = WorkspaceScheduleProposal['batches'][number];
type SchedulingWarning = WorkspaceScheduleProposal['warnings'][number];

const isSchedulingStage = (value: JsonValue): value is SchedulingStage =>
  isJsonObject(value) &&
  (value['stage'] === 'sorting' ||
    value['stage'] === 'washing' ||
    value['stage'] === 'drying' ||
    value['stage'] === 'folding_packaging') &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isStringArray(value['machineIds']);

const isSchedulingBatch = (value: JsonValue): value is SchedulingBatch =>
  isJsonObject(value) &&
  isNumber(value['sequence']) &&
  isStringArray(value['orderIds']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  Array.isArray(value['stages']) &&
  value['stages'].every(isSchedulingStage);

const isSchedulingWarningCode = (
  value: JsonValue | undefined,
): value is SchedulingWarning['code'] =>
  value === 'SHIFT_OVERFLOW' ||
  value === 'OVERSIZED_ORDER' ||
  value === 'NO_ACTIVE_WASHERS' ||
  value === 'NO_ACTIVE_DRYERS' ||
  value === 'NO_FOLDING_CAPACITY';

const isSchedulingWarning = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isSchedulingWarningCode(value['code']) &&
  isString(value['message']) &&
  isBoolean(value['blocking']) &&
  (value['orderIds'] === undefined || isStringArray(value['orderIds']));

const readSchedulingWarning = (value: JsonValue): SchedulingWarning => {
  if (
    !isJsonObject(value) ||
    !isSchedulingWarningCode(value['code']) ||
    !isString(value['message']) ||
    !isBoolean(value['blocking']) ||
    (value['orderIds'] !== undefined && !isStringArray(value['orderIds']))
  )
    return invalidStoredScheduleField('output_plan_warning');
  const orderIds = value['orderIds'];
  return {
    code: value['code'],
    message: value['message'],
    blocking: value['blocking'],
    ...(orderIds === undefined ? {} : { orderIds }),
  };
};

type SchedulingOutput = Readonly<{
  pulseMinutes: number;
  batches: WorkspaceScheduleProposal['batches'];
  unplacedOrderIds: readonly string[];
  warnings: WorkspaceScheduleProposal['warnings'];
}>;

const readSchedulingOutput = (value: unknown): SchedulingOutput => {
  if (
    !isJsonObject(value) ||
    value['algorithmVersion'] !== 'fixed-pulse-ffd-v2' ||
    !isString(value['inputSnapshotHash']) ||
    !isString(value['outputPlanHash']) ||
    !isString(value['canonicalOutput']) ||
    !isNumber(value['pulseMinutes']) ||
    !isNumber(value['pulseCapacityLbs']) ||
    !isNumber(value['batchCount']) ||
    !isNumber(value['makespanMinutes']) ||
    !isString(value['plannedCompletionAt']) ||
    !Array.isArray(value['batches']) ||
    !value['batches'].every(isSchedulingBatch) ||
    !isStringArray(value['unplacedOrderIds']) ||
    !Array.isArray(value['warnings']) ||
    !value['warnings'].every(isSchedulingWarning)
  )
    return invalidStoredScheduleField('output_plan');
  return {
    pulseMinutes: value['pulseMinutes'],
    batches: value['batches'],
    unplacedOrderIds: value['unplacedOrderIds'],
    warnings: value['warnings'].map(readSchedulingWarning),
  };
};

const mapAcknowledgedWarningCodes = (
  value: unknown,
): WorkspaceScheduleProposal['acknowledgedWarningCodes'] => {
  if (!Array.isArray(value) || !value.every(isSchedulingWarningCode))
    return invalidStoredScheduleField('acknowledged_warning_codes');
  return value as WorkspaceScheduleProposal['acknowledgedWarningCodes'];
};

const mapStageFitAssertion = (
  value: unknown,
): WorkspaceSchedulerConfig['stageFitAssertion'] => {
  if (
    !isJsonObject(value) ||
    value['sortingFits'] !== true ||
    value['washingFits'] !== true ||
    value['dryingFits'] !== true ||
    typeof value['assertedBy'] !== 'string' ||
    typeof value['assertedAt'] !== 'string'
  )
    return invalidStoredScheduleField('stage_fit_assertion');
  return {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: value['assertedBy'],
    assertedAt: value['assertedAt'],
  };
};

export const projectWorkspaceLocation = (row: {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}): WorkspaceLocation => ({
  id: row.id,
  name: row.name,
  timezone: row.timezone,
  isActive: row.isActive,
});

export const projectWorkspaceShift = (
  row: WorkspaceShiftRow,
): WorkspaceShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw productionInvariant(
      'production_workspace_shift_status_invalid',
      `Unknown production shift status: ${row.status}.`,
    );
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    effectiveFolderCount: row.effectiveFolderCount,
    status: row.status,
    version: row.version,
  };
};

export const projectWorkspaceStation = (row: {
  id: string;
  locationId: string;
  kind: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}): WorkspaceStation => {
  if (
    row.kind !== 'sorting' &&
    row.kind !== 'washing' &&
    row.kind !== 'drying' &&
    row.kind !== 'folding_packaging'
  )
    throw productionInvariant(
      'production_workspace_station_kind_invalid',
      `Unknown production station kind: ${row.kind}.`,
    );
  return { ...row, kind: row.kind };
};

export const projectWorkspaceMachine = (row: {
  id: string;
  stationKind: string;
  label: string;
  effectiveCapacityLbs: number;
  isActive: boolean;
}): WorkspaceMachine => {
  if (row.stationKind !== 'washing' && row.stationKind !== 'drying')
    throw productionInvariant(
      'production_workspace_machine_station_invalid',
      `Unknown production machine station: ${row.stationKind}.`,
    );
  return {
    id: row.id,
    stationKind: row.stationKind,
    label: row.label,
    effectiveCapacityLbs: row.effectiveCapacityLbs,
    active: row.isActive,
  };
};

export const projectWorkspaceRun = (row: WorkspaceRunRow): WorkspaceRun => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw productionInvariant(
      'production_workspace_run_status_invalid',
      `Unknown production run status: ${row.status}.`,
    );
  return {
    id: row.id,
    productionShiftId: row.productionShiftId,
    status: row.status,
    queueVersion: row.queueVersion,
    plannedCompletionAt: row.plannedCompletionAt,
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
            acknowledgedAt: row.overtimeAcknowledgedAt,
          },
    version: row.version,
  };
};

export const projectWorkspaceConfig = (
  row: WorkspaceSchedulerConfigRow,
): WorkspaceSchedulerConfig => ({
  id: row.id,
  pulseMinutes: row.pulseMinutes,
  foldLbsPerFolderMinute: row.foldLbsPerFolderMinute,
  algorithmVersion:
    row.algorithmVersion as WorkspaceSchedulerConfig['algorithmVersion'],
  version: row.version,
  stageFitAssertion: mapStageFitAssertion(row.stageFitAssertion),
  publishedAt: row.publishedAt.toISOString(),
});

export const projectWorkspaceSchedule = (
  row: WorkspaceScheduleRow,
): WorkspaceScheduleProposal => {
  const output = readSchedulingOutput(row.outputPlan);
  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    schedulerConfigId: row.schedulerConfigId,
    status: row.status as WorkspaceScheduleProposal['status'],
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    algorithmVersion:
      row.algorithmVersion as WorkspaceScheduleProposal['algorithmVersion'],
    pulseMinutes: output.pulseMinutes,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
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
      code: warning.code,
      message: warning.message,
      blocking: warning.blocking,
      ...(warning.orderIds === undefined
        ? {}
        : { orderIds: [...warning.orderIds] }),
    })),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    acknowledgedWarningCodes: [
      ...mapAcknowledgedWarningCodes(row.acknowledgedWarningCodes),
    ],
    supersededAt: row.supersededAt?.toISOString() ?? null,
  };
};

export const projectWorkspacePendingOrder = (
  row: WorkspaceOrderRow,
  dueBucket: WorkspacePendingOrder['dueBucket'],
  activeProductionRunIds: readonly string[],
): WorkspacePendingOrder => {
  if (row.bagCount === null)
    throw productionInvariant(
      'production_workspace_order_bag_intake_missing',
      'A board order is missing completed bag intake.',
    );
  const parsed = productionPendingPlacementSchema.safeParse(
    row.pendingPlacement,
  );
  if (row.pendingPlacement != null && !parsed.success)
    throw productionInvariant(
      'production_workspace_pending_placement_invalid',
      'An eligible order has invalid pending placement state.',
    );
  const defaultPlacement: PendingPlacement =
    activeProductionRunIds.length > 1
      ? {
          status: 'ambiguous_run',
          reason: 'multiple_started_runs',
          message:
            'More than one production run is active; choose the intended run before placing this order.',
          candidateProductionRunIds: [...activeProductionRunIds].sort(),
        }
      : activeProductionRunIds.length === 0
        ? {
            status: 'awaiting_run',
            reason: 'no_started_run',
            message: 'This order is waiting for a production run to start.',
          }
        : {
            status: 'awaiting_run',
            reason: 'automatic_placement_not_attempted',
            message:
              'Automatic placement has not completed; it can be retried.',
          };
  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket,
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
    placement:
      parsed.success &&
      parsed.data.status !== 'awaiting_run' &&
      parsed.data.status !== 'ambiguous_run'
        ? (parsed.data as PendingPlacement)
        : defaultPlacement,
  };
};

type ResolvedWorkspace = Omit<
  WorkspaceBaseModel,
  'liveRunChanges' | 'demandOutlook' | 'board'
> &
  Readonly<{
    liveRunChanges: LiveRunChanges | null;
    demandOutlook: DemandOutlook | null;
    board: ProductionBoard | null;
  }>;

const copyPendingPlacement = (placement: PendingPlacement) => {
  switch (placement.status) {
    case 'awaiting_run':
      return { ...placement };
    case 'ambiguous_run':
      return {
        ...placement,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
      };
    case 'not_placed':
      return {
        ...placement,
        preview:
          placement.preview === null
            ? null
            : {
                ...placement.preview,
                target: { ...placement.preview.target },
                affectedBatchIds: [...placement.preview.affectedBatchIds],
              },
      };
  }
};

const copyAutomaticPlacement = (placement: LiveAutomaticPlacement) => ({
  ...placement,
  target: { ...placement.target },
  allowedActions: [...placement.allowedActions],
  capacity: { ...placement.capacity },
  overtime: { ...placement.overtime },
});

const copyExactPlacement = (placement: LiveExactBatchTarget) => ({
  ...placement,
  target: { ...placement.target },
  allowedActions: [...placement.allowedActions],
  capacity: { ...placement.capacity },
  overtime: { ...placement.overtime },
});

export const serializeWorkspace = (
  workspace: ResolvedWorkspace,
): ProductionWorkspaceResult => ({
  location: { ...workspace.location },
  currentShift:
    workspace.currentShift === null
      ? null
      : {
          ...workspace.currentShift,
          startsAt: workspace.currentShift.startsAt.toISOString(),
          endsAt: workspace.currentShift.endsAt.toISOString(),
        },
  shiftSelection:
    workspace.shiftSelection === null
      ? null
      : {
          ...workspace.shiftSelection,
          selectedOrderIds: [...workspace.shiftSelection.selectedOrderIds],
        },
  candidateShifts: workspace.candidateShifts.map((shift) => ({
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
  })),
  currentSchedulerConfig:
    workspace.currentSchedulerConfig === null
      ? null
      : {
          ...workspace.currentSchedulerConfig,
          stageFitAssertion: {
            ...workspace.currentSchedulerConfig.stageFitAssertion,
          },
        },
  currentScheduleProposal:
    workspace.currentScheduleProposal === null
      ? null
      : {
          ...workspace.currentScheduleProposal,
          batches: workspace.currentScheduleProposal.batches.map((batch) => ({
            ...batch,
            orderIds: [...batch.orderIds],
            stages: batch.stages.map((stage) => ({
              ...stage,
              machineIds: [...stage.machineIds],
            })),
          })),
          unplacedOrderIds: [
            ...workspace.currentScheduleProposal.unplacedOrderIds,
          ],
          warnings: workspace.currentScheduleProposal.warnings.map(
            (warning) => ({
              code: warning.code,
              message: warning.message,
              blocking: warning.blocking,
              ...(warning.orderIds === undefined
                ? {}
                : { orderIds: [...warning.orderIds] }),
            }),
          ),
          acknowledgedWarningCodes: [
            ...workspace.currentScheduleProposal.acknowledgedWarningCodes,
          ],
        },
  activeRuns: workspace.activeRuns.map((run) => ({
    ...run,
    plannedCompletionAt: run.plannedCompletionAt.toISOString(),
    overtimeAcknowledgement:
      run.overtimeAcknowledgement === null
        ? null
        : {
            ...run.overtimeAcknowledgement,
            acknowledgedAt:
              run.overtimeAcknowledgement.acknowledgedAt.toISOString(),
          },
  })),
  orders: workspace.orders.map((order) => ({
    ...order,
    dueAt: order.dueAt.toISOString(),
  })),
  pendingEligibleOrders: workspace.pendingEligibleOrders.map((order) => ({
    ...order,
    placement: copyPendingPlacement(order.placement),
  })),
  liveRunChanges:
    workspace.liveRunChanges === null
      ? null
      : {
          ...workspace.liveRunChanges,
          orders: workspace.liveRunChanges.orders.map((order) => ({
            ...order,
            placement: copyPendingPlacement(order.placement),
            recommendedPlacement:
              order.recommendedPlacement.status === 'available'
                ? {
                    status: 'available',
                    placement: copyAutomaticPlacement(
                      order.recommendedPlacement.placement,
                    ),
                  }
                : { ...order.recommendedPlacement },
            exactBatchTargets: order.exactBatchTargets.map(copyExactPlacement),
          })),
        },
  demandOutlook:
    workspace.demandOutlook === null
      ? null
      : {
          ...workspace.demandOutlook,
          horizonCutoffAt:
            workspace.demandOutlook.horizonCutoffAt.toISOString(),
          items: workspace.demandOutlook.items.map((item) => ({
            ...item,
            dueAt: item.dueAt.toISOString(),
          })),
          forecast:
            workspace.demandOutlook.forecast === null
              ? null
              : {
                  ...workspace.demandOutlook.forecast,
                  batches: workspace.demandOutlook.forecast.batches.map(
                    (batch) => ({
                      ...batch,
                      demandIds: [...batch.demandIds],
                    }),
                  ),
                  unplacedDemandIds: [
                    ...workspace.demandOutlook.forecast.unplacedDemandIds,
                  ],
                },
        },
  board: workspace.board === null ? null : serializeBoard(workspace.board),
  stations: workspace.stations.map((station) => ({ ...station })),
  machines: workspace.machines.map((machine) => ({ ...machine })),
  asOf: workspace.asOf.toISOString(),
});
