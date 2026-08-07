import type { AcceptScheduleResult } from '../../src/features/scheduling/accept-schedule/accept-schedule.model.ts';
import type { StartScheduleResult } from '../../src/features/scheduling/start-schedule/start-schedule.model.ts';
import type {
  ProductionBoardProjection,
  ProductionBoardRun,
  UnevaluatedProductionBoardBatch,
  UnevaluatedProductionBoard,
  UnevaluatedProductionBoardStage,
} from '../../src/foundations/language/board/production-board-read.model.ts';
import type { ProductionWorkspaceReadModel } from '../../src/features/queries/load-workspace/load-production-workspace.port.ts';
import type { ProductionWorkspaceShiftCandidate } from '../../src/features/queries/load-workspace/load-production-workspace.model.ts';
import type { ProductionWorkspaceMachine } from '../../src/features/queries/load-workspace/load-production-workspace.model.ts';
import type { ProductionRepositories } from '../../src/composition/production.composition.ts';
import type { IdSource } from '@pressly/kernel';
import type {
  StoredWorkEvent,
  WorkEventInput,
} from '../../src/foundations/language/commands/production-command.model.ts';
import type { OnlinePlacementProposal } from '../../src/foundations/language/scheduling/online-placement.model.ts';
import type {
  ProductionOrderExecutionState,
  ProductionOrderSchedulingMutation,
  ProductionOrderStageAttemptState,
} from '../../src/foundations/language/execution/production-lifecycle.model.ts';
import type { SchedulingInput } from '../../src/foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleProposal } from '../../src/foundations/language/scheduling/schedule-proposal.entity.ts';
import type { SchedulerConfig } from '../../src/foundations/language/scheduling/scheduler-config.model.ts';
import type {
  StageTransitionContext,
  StoredStage,
} from '../../src/foundations/language/execution/stage-transition.model.ts';
import type { ProductionOrderListItem as ProductionOrderReadItem } from '../../src/foundations/language/orders/production-order-list-item.model.ts';
import type { ProductionShift } from '../../src/foundations/language/shifts/production-shift.entity.ts';
import type { ProductionOrderPlacedResult } from '../../src/foundations/language/scheduling/production-placement.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ApplyFulfillmentDemandCommand,
  FulfillmentProductionMutation,
  StoredFulfillmentDemand,
} from '../../src/features/demand/apply-fulfillment-demand/apply-fulfillment-demand.port.ts';
import { productionDueBucket } from '../../src/foundations/language/due-dates/production-due-bucket.policy.ts';
import { scheduleCoversInputExactly } from '../../src/foundations/language/scheduling/schedule-snapshot-validation.policy.ts';
import type { ResolveSourceClosedFulfillmentRepository } from '../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.port.ts';

type StoredOrder = {
  id: string;
  locationId: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: string;
  dueBucket: ProductionOrderReadItem['dueBucket'];
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number | null;
  admissionOverride: 'released' | null;
  finishedAt: string | null;
  version: number;
  executionStatus: ProductionOrderExecutionState;
  resolutionState: 'open' | 'resolved_without_production';
  status:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
};

type StoredRun = {
  id: string;
  locationId: string;
  scheduleRunId: string;
  productionShiftId: string;
  status: 'started' | 'completed';
  queueVersion: number;
  plannedCompletionAt: string;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: string | null;
  completedAt: string | null;
  version: number;
};

type StoredBatch = {
  id: string;
  locationId: string;
  productionRunId: string;
  sequence: number;
  status:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  pulseMinutes: number;
  membership:
    | Readonly<{ state: 'mutable' }>
    | Readonly<{ state: 'frozen'; frozenAt: string; frozenBy: string }>;
  orderIds: string[];
  stageIds: string[];
  startedAt: string | null;
  finishedAt: string | null;
  version: number;
};

type State = {
  demands: Map<string, StoredFulfillmentDemand>;
  orders: Map<string, StoredOrder>;
  configs: Map<
    string,
    Readonly<{ locationId: string; value: SchedulerConfig }>
  >;
  shifts: Map<string, ProductionShift>;
  shiftSelections: Map<
    string,
    Readonly<{
      locationId: string;
      version: number;
      selectedOrderIds: readonly string[];
    }>
  >;
  machines: Map<string, ProductionWorkspaceMachine>;
  schedules: Map<string, ScheduleProposal>;
  scheduleLocationIds: Map<string, string>;
  schedulingInputs: Map<string, SchedulingInput>;
  runs: Map<string, StoredRun>;
  runIdBySchedule: Map<string, string>;
  batches: Map<string, StoredBatch>;
  stages: Map<
    string,
    StoredStage & { locationId: string; actualEndAt: string | null }
  >;
  stageAttempts: Map<
    string,
    Readonly<{
      id: string;
      productionOrderId: string;
      stageRunId: string;
      status: ProductionOrderStageAttemptState;
    }>
  >;
  stageMachineStatuses: Map<string, 'planned' | 'active' | 'completed'>;
  bagStatuses: Map<string, ('eligible' | 'finished')[]>;
  activeBatchOrderIds: Map<string, Set<string>>;
  batchOrderMetadata: Map<
    string,
    Readonly<{
      placementProvenance: 'initial_schedule' | 'automatic' | 'manager_exact';
      pinnedAt: string | null;
      pinnedBy: string | null;
    }>
  >;
  workEvents: Map<string, StoredWorkEvent>;
  acceptanceResults: Map<string, AcceptScheduleResult>;
  startResults: Map<string, StartScheduleResult>;
  intakeVersions: Map<string, number>;
};

const emptyState = (): State => ({
  demands: new Map(),
  orders: new Map(),
  configs: new Map(),
  shifts: new Map(),
  shiftSelections: new Map(),
  machines: new Map(),
  schedules: new Map(),
  scheduleLocationIds: new Map(),
  schedulingInputs: new Map(),
  runs: new Map(),
  runIdBySchedule: new Map(),
  batches: new Map(),
  stages: new Map(),
  stageAttempts: new Map(),
  stageMachineStatuses: new Map(),
  bagStatuses: new Map(),
  activeBatchOrderIds: new Map(),
  batchOrderMetadata: new Map(),
  workEvents: new Map(),
  acceptanceResults: new Map(),
  startResults: new Map(),
  intakeVersions: new Map(),
});

const bucket = (
  dueAt: string,
  now: Date,
): ProductionOrderReadItem['dueBucket'] =>
  productionDueBucket(new Date(dueAt), now, 'America/New_York');

const clone = <T>(value: T): T => structuredClone(value);

const batchOrderKey = (batchId: string, orderId: string): string =>
  `${batchId}:${orderId}`;

type OperationsOf<Key extends keyof ProductionRepositories> =
  ProductionRepositories[Key] extends UnitOfWork<infer Operations>
    ? Operations
    : never;

type MemoryProductionOperations = OperationsOf<'acceptSchedule'> &
  OperationsOf<'advanceProductionStage'> &
  OperationsOf<'assignStageMachines'> &
  OperationsOf<'changeProductionAdmission'> &
  OperationsOf<'changeProductionOrderResolution'> &
  ResolveSourceClosedFulfillmentRepository &
  OperationsOf<'createSchedule'> &
  Readonly<{
    loadBoard: (
      locationId: string,
      productionRunId: string,
      now: Date,
    ) => Promise<UnevaluatedProductionBoard | null>;
  }> &
  OperationsOf<'manageProductionResources'> &
  OperationsOf<'createProductionShift'> &
  OperationsOf<'updateProductionShift'> &
  OperationsOf<'applyFulfillmentDemand'> &
  OperationsOf<'publishSchedulerConfig'> &
  OperationsOf<'recordOrderIntake'> &
  OperationsOf<'replaceShiftOrderSelection'> &
  OperationsOf<'setProductionOrderPriority'> &
  OperationsOf<'startSchedule'>;

export type MemoryProductionRepositories = Readonly<{
  repositories: ProductionRepositories;
  seedMachines: (machines: readonly ProductionWorkspaceMachine[]) => void;
  inspect: () => State;
  inspectStageTransitionContext: (
    stageRunId: string,
    now: Date,
  ) => Promise<StageTransitionContext | null>;
  commitPlacementForTest: (input: {
    locationId: string;
    productionRunId: string;
    productionOrderId: string;
    actorId: string;
    mode: 'automatic' | 'manager_exact';
    proposal: OnlinePlacementProposal;
    overtimeConfirmed: boolean;
    orderLifecycle: ProductionOrderSchedulingMutation;
    initialBatchState: 'queued';
    initialStageState: 'planned';
    initialAttemptState: 'assigned';
    now: Date;
  }) => ProductionOrderPlacedResult;
}>;

export const makeMemoryProductionRepositories = (deps: {
  ids: IdSource;
}): MemoryProductionRepositories => {
  let state = emptyState();

  const transactionFor = (): MemoryProductionOperations => ({
    lockLocationScheduling: async () => undefined,

    locationIsActive: async (locationId) => locationId === 'location-1',

    lockFulfillment: async () => undefined,

    loadDemand: async (fulfillmentId) => {
      const demand = state.demands.get(fulfillmentId);
      if (demand === undefined) return null;

      const productionOrder =
        demand.productionOrderId === null
          ? undefined
          : state.orders.get(demand.productionOrderId);

      return clone({
        ...demand,
        bagCount: productionOrder?.bagCount ?? null,
        admissionOverride: productionOrder?.admissionOverride ?? null,
        productionExecutionStatus: productionOrder?.executionStatus ?? null,
        productionResolutionState: productionOrder?.resolutionState ?? null,
        productionStatus: productionOrder?.status ?? null,
      });
    },

    applyDemand: async ({
      command,
      orderDemandId,
      production,
      initialExecutionState,
      now,
    }: {
      command: ApplyFulfillmentDemandCommand;
      orderDemandId: string;
      production: FulfillmentProductionMutation;
      initialExecutionState: 'unassigned';
      now: Date;
    }) => {
      const stored = state.demands.get(command.fulfillmentId);
      let productionOrderId = stored?.productionOrderId ?? null;
      const previous =
        productionOrderId === null
          ? undefined
          : state.orders.get(productionOrderId);

      if (production.action === 'none' && previous !== undefined)
        throw new Error('A no-op demand projection found production work.');
      if (production.action === 'preserve' && previous === undefined)
        throw new Error('A preserved demand is missing production work.');
      if (production.action === 'create' && previous !== undefined)
        throw new Error('A new demand projection found production work.');
      if (production.action === 'update' && previous === undefined)
        throw new Error('An updated demand is missing production work.');

      if (production.action === 'create' || production.action === 'update') {
        const derivedWeightLbs =
          command.estimatedWeightLbs ?? previous?.derivedWeightLbs;
        if (derivedWeightLbs === undefined)
          throw new Error('Production work requires a positive estimate.');
        productionOrderId ??= deps.ids.next();
        state.orders.set(productionOrderId, {
          id: productionOrderId,
          locationId: command.locationId,
          orderDemandId,
          externalOrderId: command.displayReference ?? command.fulfillmentId,
          dueAt: command.dueAt,
          dueBucket: bucket(command.dueAt, now),
          priority: previous?.priority ?? false,
          derivedWeightLbs,
          bagCount: previous?.bagCount ?? null,
          admissionOverride:
            command.admissionState === 'unreleased'
              ? (previous?.admissionOverride ?? null)
              : null,
          finishedAt: previous?.finishedAt ?? null,
          version: (previous?.version ?? 0) + 1,
          executionStatus: previous?.executionStatus ?? initialExecutionState,
          resolutionState: previous?.resolutionState ?? 'open',
          status: production.status,
        });
      }

      const demand: StoredFulfillmentDemand = {
        orderDemandId,
        productionOrderId,
        fulfillmentId: command.fulfillmentId,
        fulfillmentVersion: command.fulfillmentVersion,
        projectionHash: command.projectionHash,
        locationId: command.locationId,
        admissionState: command.admissionState,
        commercialState: command.commercialState,
        dueAt: command.dueAt,
        estimatedWeightLbs: command.estimatedWeightLbs,
        estimatedWeightSource: command.estimatedWeightSource,
        bagCount:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.bagCount ?? null),
        admissionOverride:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.admissionOverride ?? null),
        productionExecutionStatus:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.executionStatus ?? null),
        productionResolutionState:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.resolutionState ?? null),
        productionStatus:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.status ?? null),
      };
      state.demands.set(command.fulfillmentId, demand);
      return clone(demand);
    },

    loadResources: async () => ({
      location: null,
      stations: [],
      machines: [],
      schedulerConfig: null,
    }),

    applyResources: async ({ result, idempotencyKey, idempotency }) => {
      if (state.workEvents.has(idempotencyKey))
        throw new Error('Idempotency key already exists.');
      state.workEvents.set(idempotencyKey, {
        command: clone(idempotency),
        result: clone(result),
        valid: true,
      });
    },

    findCandidate: async (locationId, fulfillmentId) => {
      const demand = state.demands.get(fulfillmentId);
      const order =
        demand === undefined
          ? undefined
          : [...state.orders.values()].find(
              (candidate) => candidate.orderDemandId === demand.orderDemandId,
            );
      return demand === undefined ||
        order === undefined ||
        order.locationId !== locationId
        ? null
        : {
            orderId: order.id,
            locationId: order.locationId,
            productionVersion: order.version,
            resolutionState: order.resolutionState,
            sourceAdmissionState: demand.admissionState,
            sourceCommercialState: demand.commercialState,
          };
    },

    lockOrder: async (locationId, orderId) => {
      const order = state.orders.get(orderId);
      const demand =
        order === undefined
          ? undefined
          : [...state.demands.values()].find(
              (candidate) => candidate.orderDemandId === order.orderDemandId,
            );
      return order === undefined || order.locationId !== locationId
        ? null
        : {
            orderId,
            locationId,
            productionStatus: order.status,
            operationalStatus: order.status,
            productionVersion: order.version,
            resolutionState: order.resolutionState,
            intakeVersion: state.intakeVersions.get(orderId) ?? 0,
            derivedWeightLbs: order.derivedWeightLbs,
            sourceAdmissionState: demand?.admissionState ?? 'unreleased',
            sourceCommercialState: demand?.commercialState ?? 'open',
            sourceDueAt: new Date(demand?.dueAt ?? order.dueAt),
            sourceEstimatedWeightLbs:
              demand === undefined
                ? order.derivedWeightLbs
                : demand.estimatedWeightLbs,
            sourceEstimatedWeightSource:
              demand === undefined
                ? 'external_estimate'
                : demand.estimatedWeightSource,
            executionStatus: order.executionStatus,
            admissionOverride: order.admissionOverride,
            bagCount: order.bagCount,
            selectedForShift: [...state.shiftSelections.values()].some(
              (selection) =>
                selection.locationId === locationId &&
                selection.selectedOrderIds.includes(orderId),
            ),
            hasActivePlacement: [...state.activeBatchOrderIds.values()].some(
              (activeOrderIds) => activeOrderIds.has(orderId),
            ),
            hasIntake:
              (state.intakeVersions.get(orderId) ?? 0) > 0 ||
              order.bagCount !== null,
            hasManualAdmission: order.admissionOverride !== null,
            isPriority: order.priority,
            hasPendingPlacement: false,
            hasShiftSelection: [...state.shiftSelections.values()].some(
              (selection) =>
                selection.locationId === locationId &&
                selection.selectedOrderIds.includes(orderId),
            ),
            hasHistoricalPlanSelection: false,
            hasBatchMembership: [...state.activeBatchOrderIds.values()].some(
              (activeOrderIds) => activeOrderIds.has(orderId),
            ),
            hasStageAttempt: [...state.stageAttempts.values()].some(
              (attempt) => attempt.productionOrderId === orderId,
            ),
            hasRoute: false,
            demandPhase:
              demand?.commercialState !== undefined &&
              demand.commercialState !== 'open'
                ? 'post_production'
                : demand?.admissionState === 'withdrawn'
                  ? 'withdrawn'
                  : demand?.admissionState === 'unreleased'
                    ? 'expected'
                    : 'production_released',
          };
    },

    lockPriorityOrder: async (locationId, productionOrderId) => {
      const order = state.orders.get(productionOrderId);
      return order === undefined || order.locationId !== locationId
        ? null
        : {
            version: order.version,
            resolutionState: order.resolutionState,
          };
    },

    recordIntake: async ({
      locationId,
      orderId,
      bagCount,
      expectedVersion,
      currentIntakeVersion,
      nextStatus,
    }) => {
      const order = state.orders.get(orderId);
      if (
        order === undefined ||
        order.locationId !== locationId ||
        order.version !== expectedVersion
      )
        return null;
      const version = expectedVersion + 1;
      const intakeVersion = currentIntakeVersion + 1;
      state.orders.set(orderId, {
        ...order,
        bagCount,
        status: nextStatus,
        version,
      });
      state.intakeVersions.set(orderId, intakeVersion);
      state.bagStatuses.set(
        orderId,
        Array.from({ length: bagCount }, () => 'eligible'),
      );
      return {
        locationId,
        orderId,
        bagCount,
        bagCountProvenance: 'operator_intake',
        intakeVersion,
        version,
        replayed: false,
      };
    },

    changeAdmission: async ({
      locationId,
      orderId,
      actorId: _actorId,
      expectedVersion,
      admissionOverride,
      nextStatus,
      now: _now,
    }) => {
      const order = state.orders.get(orderId);
      if (
        order === undefined ||
        order.locationId !== locationId ||
        order.version !== expectedVersion
      )
        return null;
      const updated = {
        ...order,
        admissionOverride,
        status: nextStatus,
        version: expectedVersion + 1,
      };
      state.orders.set(orderId, updated);
      return {
        locationId,
        orderId,
        admissionOverride,
        status: nextStatus,
        version: updated.version,
        replayed: false,
      };
    },

    changeResolution: async ({
      locationId,
      orderId,
      expectedVersion,
      lifecycle,
      restoredSourceProjection,
      now,
    }) => {
      const order = state.orders.get(orderId);
      if (
        order === undefined ||
        order.locationId !== locationId ||
        order.version !== expectedVersion ||
        order.resolutionState !== lifecycle.from
      )
        return null;
      const updated = {
        ...order,
        resolutionState: lifecycle.state,
        ...(restoredSourceProjection === null
          ? {}
          : {
              dueAt: restoredSourceProjection.dueAt.toISOString(),
              dueBucket: bucket(
                restoredSourceProjection.dueAt.toISOString(),
                now,
              ),
              derivedWeightLbs: restoredSourceProjection.derivedWeightLbs,
              status: restoredSourceProjection.operationalStatus,
              admissionOverride: restoredSourceProjection.clearAdmissionOverride
                ? null
                : order.admissionOverride,
            }),
        version: expectedVersion + 1,
      };
      state.orders.set(orderId, updated);
      return {
        locationId,
        orderId,
        action:
          lifecycle.state === 'resolved_without_production'
            ? ('resolve_without_production' as const)
            : ('restore' as const),
        resolutionState: lifecycle.state,
        transitionedAt: now.toISOString(),
        version: updated.version,
        replayed: false,
      };
    },

    nextSchedulerConfigVersion: async (locationId) =>
      Math.max(
        0,
        ...[...state.configs.values()]
          .filter((config) => config.locationId === locationId)
          .map((config) => config.value.version),
      ) + 1,

    saveSchedulerConfig: async (locationId, config) => {
      if (
        [...state.configs.values()].some(
          (stored) =>
            stored.locationId === locationId &&
            stored.value.version === config.version,
        )
      )
        throw new Error('Scheduler config version already exists.');
      state.configs.set(config.id, { locationId, value: clone(config) });
      return clone(config);
    },

    saveShift: async (shift) => {
      if (state.shifts.has(shift.id)) throw new Error('Shift already exists.');
      state.shifts.set(shift.id, clone(shift));
      return clone(shift);
    },

    lockShift: async (locationId, productionShiftId) => {
      const shift = state.shifts.get(productionShiftId);
      return shift === undefined || shift.locationId !== locationId
        ? null
        : clone(shift);
    },

    updateShift: async ({
      locationId,
      productionShiftId,
      startsAt,
      endsAt,
      effectiveFolderCount,
      expectedVersion,
    }) => {
      const shift = state.shifts.get(productionShiftId);
      if (
        shift === undefined ||
        shift.locationId !== locationId ||
        shift.version !== expectedVersion
      )
        return null;
      const updated = {
        ...shift,
        startsAt,
        endsAt,
        effectiveFolderCount,
        version: shift.version + 1,
      };
      state.shifts.set(productionShiftId, updated);
      return clone(updated);
    },

    lockSelection: async (locationId, productionShiftId) => {
      const shift = state.shifts.get(productionShiftId);
      if (shift === undefined || shift.locationId !== locationId)
        return {
          state: 'not_found',
          version: 0,
          selectedOrderIds: [],
          currentSchedule: null,
        };
      if (
        [...state.runs.values()].some(
          (run) =>
            run.locationId === locationId &&
            run.productionShiftId === productionShiftId,
        )
      )
        return {
          state: 'run_exists',
          version: 0,
          selectedOrderIds: [],
          currentSchedule: null,
        };
      const selection = state.shiftSelections.get(productionShiftId);
      const currentSchedule = [...state.schedules.values()].find(
        (schedule) =>
          state.scheduleLocationIds.get(schedule.scheduleRunId) ===
            locationId &&
          schedule.productionShiftId === productionShiftId &&
          (schedule.status === 'draft' || schedule.status === 'accepted'),
      );
      return {
        state: 'available',
        version: selection?.version ?? 0,
        selectedOrderIds: [...(selection?.selectedOrderIds ?? [])].sort(),
        currentSchedule:
          currentSchedule === undefined
            ? null
            : {
                scheduleRunId: currentSchedule.scheduleRunId,
                status: currentSchedule.status,
              },
      };
    },

    selectedOrdersAreReady: async (locationId, productionOrderIds) =>
      productionOrderIds.every((orderId) => {
        const order = state.orders.get(orderId);
        return (
          order !== undefined &&
          order.locationId === locationId &&
          order.status === 'eligible' &&
          order.bagCount !== null
        );
      }),

    replaceSelection: async ({
      locationId,
      productionShiftId,
      selectedOrderIds,
      currentVersion,
      supersede,
      now,
    }) => {
      const current = state.shiftSelections.get(productionShiftId);
      if ((current?.version ?? 0) !== currentVersion) return null;
      const version = currentVersion + 1;
      state.shiftSelections.set(productionShiftId, {
        locationId,
        version,
        selectedOrderIds: [...selectedOrderIds],
      });
      const schedule =
        supersede === null
          ? undefined
          : state.schedules.get(supersede.scheduleRunId);
      if (
        supersede !== null &&
        (schedule === undefined ||
          state.scheduleLocationIds.get(schedule.scheduleRunId) !==
            locationId ||
          schedule.status !== supersede.lifecycle.from)
      )
        throw new Error('Current schedule revision changed unexpectedly.');
      if (schedule !== undefined && supersede !== null)
        state.schedules.set(schedule.scheduleRunId, {
          ...schedule,
          status: supersede.lifecycle.state,
          supersededAt: now.toISOString(),
        });
      return {
        selection: {
          productionShiftId,
          version,
          selectedOrderIds: [...selectedOrderIds],
        },
        supersededScheduleRunId: schedule?.scheduleRunId ?? null,
        replayed: false,
      };
    },

    lockCurrentSchedule: async (locationId, productionShiftId) => {
      const current = [...state.schedules.values()].filter(
        (schedule) =>
          state.scheduleLocationIds.get(schedule.scheduleRunId) ===
            locationId &&
          schedule.productionShiftId === productionShiftId &&
          (schedule.status === 'draft' || schedule.status === 'accepted'),
      );
      if (current.length > 1)
        throw new Error('More than one current schedule revision was found.');
      const schedule = current[0];
      return schedule === undefined
        ? null
        : { scheduleRunId: schedule.scheduleRunId, status: schedule.status };
    },

    supersedeCurrentSchedule: async ({
      locationId,
      scheduleRunId,
      lifecycle,
      now,
    }) => {
      const schedule = state.schedules.get(scheduleRunId);
      if (
        schedule === undefined ||
        state.scheduleLocationIds.get(schedule.scheduleRunId) !== locationId ||
        schedule.status !== lifecycle.from
      )
        throw new Error('Current schedule revision changed unexpectedly.');
      state.schedules.set(schedule.scheduleRunId, {
        ...schedule,
        status: lifecycle.state,
        supersededAt: now.toISOString(),
      });
      return schedule.scheduleRunId;
    },

    lockShiftForPlanning: async (locationId, productionShiftId) => {
      const shift = state.shifts.get(productionShiftId);
      if (shift === undefined || shift.locationId !== locationId)
        return 'not_found';
      return [...state.runs.values()].some(
        (run) =>
          run.locationId === locationId &&
          run.productionShiftId === productionShiftId,
      )
        ? 'run_exists'
        : 'available';
    },

    loadSchedulingInput: async ({
      locationId,
      productionShiftId,
      schedulerConfigId,
    }) => {
      const shift = state.shifts.get(productionShiftId);
      const storedConfig = state.configs.get(schedulerConfigId);
      if (
        shift === undefined ||
        shift.locationId !== locationId ||
        storedConfig === undefined ||
        storedConfig.locationId !== locationId
      )
        return null;
      const config = storedConfig.value;
      if (config.algorithmVersion !== 'fixed-pulse-ffd-v2') return null;
      const selectedOrderIds =
        state.shiftSelections.get(productionShiftId)?.selectedOrderIds ?? [];
      if (selectedOrderIds.length === 0) return 'selection_empty';
      const selectedOrders = selectedOrderIds.map((orderId) =>
        state.orders.get(orderId),
      );
      if (
        selectedOrders.some(
          (order) =>
            order === undefined ||
            order.locationId !== locationId ||
            order.status !== 'eligible' ||
            order.bagCount === null,
        )
      )
        return 'selection_invalid';

      return {
        orders: selectedOrders
          .filter(
            (order): order is StoredOrder & { bagCount: number } =>
              order !== undefined && order.bagCount !== null,
          )
          .map(
            ({
              orderDemandId: _orderDemandId,
              locationId: _locationId,
              status: _status,
              dueBucket: _bucket,
              ...order
            }) => clone(order),
          ),
        machines: [...state.machines.values()]
          .filter(
            (
              machine,
            ): machine is ProductionWorkspaceMachine & {
              stationKind: 'washing' | 'drying';
            } => ['washing', 'drying'].includes(machine.stationKind),
          )
          .map((machine) => ({
            id: machine.id,
            stationKind: machine.stationKind,
            effectiveCapacityLbs: machine.effectiveCapacityLbs,
            active: machine.active,
          })),
        shift: {
          id: shift.id,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
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
      };
    },

    loadCurrentPlan: async (locationId, productionShiftId) => {
      const current = [...state.schedules.values()].find(
        (schedule) =>
          state.scheduleLocationIds.get(schedule.scheduleRunId) ===
            locationId &&
          schedule.productionShiftId === productionShiftId &&
          (schedule.status === 'draft' || schedule.status === 'accepted'),
      );
      return current === undefined
        ? null
        : { scheduleRunId: current.scheduleRunId, status: current.status };
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
        const existing = state.schedules.get(supersede.scheduleRunId);
        if (
          existing === undefined ||
          existing.status !== supersede.lifecycle.from
        )
          throw new Error('Current schedule revision changed unexpectedly.');
        state.schedules.set(existing.scheduleRunId, {
          ...existing,
          status: supersede.lifecycle.state,
          supersededAt: now.toISOString(),
        });
      }

      const schedule: ScheduleProposal = {
        scheduleRunId: id,
        productionShiftId: schedulingInput.shift.id,
        schedulerConfigId: schedulingInput.config.id,
        status: initialStatus,
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
          code: warning.code,
          message: warning.message,
          blocking: warning.blocking,
          ...(warning.orderIds === undefined
            ? {}
            : { orderIds: [...warning.orderIds] }),
        })),
        createdAt: now.toISOString(),
        acceptedAt: null,
        acceptedBy: null,
        acknowledgedWarningCodes: [],
        supersededAt: null,
      };
      state.schedules.set(id, clone(schedule));
      state.scheduleLocationIds.set(id, locationId);
      state.schedulingInputs.set(id, clone(schedulingInput));
      return clone(schedule);
    },

    loadSchedule: async (locationId, scheduleRunId) => {
      if (state.scheduleLocationIds.get(scheduleRunId) !== locationId)
        return null;
      const schedule = state.schedules.get(scheduleRunId);
      const inputSnapshot = state.schedulingInputs.get(scheduleRunId);
      return schedule === undefined || inputSnapshot === undefined
        ? null
        : clone({
            schedule,
            inputSnapshot,
            acceptedBy: schedule.acceptedBy,
            acknowledgedWarningCodes: schedule.acknowledgedWarningCodes,
          });
    },

    lockAndValidateScheduleInput: async (locationId, record) => {
      if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
        return false;
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (snapshots.size !== record.inputSnapshot.orders.length) return false;
      const selectedOrderIds = [
        ...(state.shiftSelections.get(record.schedule.productionShiftId)
          ?.selectedOrderIds ?? []),
      ].sort();
      if (
        JSON.stringify(selectedOrderIds) !==
        JSON.stringify([...snapshots.keys()].sort())
      )
        return false;
      return record.inputSnapshot.orders.every((snapshot) => {
        const order = state.orders.get(snapshot.id);
        return (
          order !== undefined &&
          order.locationId === locationId &&
          order.status === 'eligible' &&
          order.version === snapshot.version &&
          order.derivedWeightLbs === snapshot.derivedWeightLbs &&
          order.bagCount === snapshot.bagCount &&
          order.priority === snapshot.priority &&
          order.dueAt === snapshot.dueAt
        );
      });
    },

    lockAndLoadStartOrders: async (locationId, record) => {
      if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
        return null;
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (snapshots.size !== record.inputSnapshot.orders.length) return null;
      const selectedOrderIds = [
        ...(state.shiftSelections.get(record.schedule.productionShiftId)
          ?.selectedOrderIds ?? []),
      ].sort();
      if (
        JSON.stringify(selectedOrderIds) !==
        JSON.stringify([...snapshots.keys()].sort())
      )
        return null;

      const lockedOrders = record.inputSnapshot.orders.map((snapshot) => {
        const order = state.orders.get(snapshot.id);
        const valid =
          order !== undefined &&
          order.locationId === locationId &&
          order.status === 'eligible' &&
          order.version === snapshot.version &&
          order.derivedWeightLbs === snapshot.derivedWeightLbs &&
          order.bagCount === snapshot.bagCount &&
          order.priority === snapshot.priority &&
          order.dueAt === snapshot.dueAt;
        return valid
          ? {
              id: order.id,
              operationalStatus: order.status,
              executionStatus: order.executionStatus,
              version: order.version,
            }
          : null;
      });
      if (lockedOrders.some((order) => order === null)) return null;
      return lockedOrders.filter(
        (order): order is Exclude<(typeof lockedOrders)[number], null> =>
          order !== null,
      );
    },

    acceptSchedule: async (
      locationId,
      schedule,
      actorId,
      acknowledgedWarningCodes,
      idempotencyKey,
      idempotency,
      lifecycle,
      now,
    ) => {
      if (state.scheduleLocationIds.get(schedule.scheduleRunId) !== locationId)
        throw new Error('Schedule location mismatch.');
      const replay = state.acceptanceResults.get(idempotencyKey);
      if (replay !== undefined) return { ...clone(replay), replayed: true };

      state.schedules.set(schedule.scheduleRunId, {
        ...schedule,
        status: lifecycle.state,
        acceptedAt: now.toISOString(),
        acceptedBy: actorId,
        acknowledgedWarningCodes: schedule.warnings
          .map((warning) => warning.code)
          .filter((code) => acknowledgedWarningCodes.includes(code)),
      });
      const acceptance = {
        scheduleRunId: schedule.scheduleRunId,
        productionShiftId: schedule.productionShiftId,
        acceptedAt: now.toISOString(),
        replayed: false,
      };
      state.acceptanceResults.set(idempotencyKey, acceptance);
      state.workEvents.set(idempotencyKey, {
        command: clone(idempotency),
        result: clone(acceptance),
        valid: true,
      });
      return clone(acceptance);
    },

    productionRunExists: async (locationId, productionShiftId) =>
      [...state.runs.values()].some(
        (run) =>
          run.locationId === locationId &&
          run.productionShiftId === productionShiftId,
      ),

    lockShiftForStart: async (locationId, productionShiftId) => {
      const shift = state.shifts.get(productionShiftId);
      return shift !== undefined && shift.locationId === locationId;
    },

    startSchedule: async ({
      locationId,
      record,
      productionRunStatus,
      orderLifecycles,
      initialBatchState,
      initialStageState,
      initialAttemptState,
      idempotencyKey,
      idempotency,
      now,
    }) => {
      const replay = state.startResults.get(idempotencyKey);
      if (replay !== undefined) return { ...clone(replay), replayed: true };
      const { schedule } = record;
      const lifecycleByOrderId = new Map(
        orderLifecycles.map((order) => [order.productionOrderId, order]),
      );
      const selectedOrderIds = schedule.batches.flatMap(
        (batch) => batch.orderIds,
      );
      if (
        lifecycleByOrderId.size !== selectedOrderIds.length ||
        selectedOrderIds.some((orderId) => !lifecycleByOrderId.has(orderId))
      )
        throw new Error('Order execution decisions are incomplete at Start.');
      const productionRunId = deps.ids.next();
      const productionBatchIds: string[] = [];
      state.runs.set(productionRunId, {
        id: productionRunId,
        locationId,
        scheduleRunId: schedule.scheduleRunId,
        productionShiftId: schedule.productionShiftId,
        status: productionRunStatus,
        queueVersion: 1,
        plannedCompletionAt: schedule.plannedCompletionAt,
        overtimeProposalHash: null,
        overtimeQueueVersion: null,
        overtimeAcknowledgedBy: null,
        overtimeAcknowledgedAt: null,
        completedAt: null,
        version: 1,
      });
      state.runIdBySchedule.set(schedule.scheduleRunId, productionRunId);

      for (const proposed of schedule.batches) {
        const batchId = deps.ids.next();
        const stageIds: string[] = [];
        productionBatchIds.push(batchId);
        for (const proposedStage of proposed.stages) {
          const stageId = deps.ids.next();
          stageIds.push(stageId);
          state.stages.set(stageId, {
            id: stageId,
            locationId,
            productionBatchId: batchId,
            stage: proposedStage.stage,
            status: initialStageState,
            plannedStartAt: proposedStage.startsAt,
            plannedEndAt: proposedStage.endsAt,
            actualStartAt: null,
            actualEndAt: null,
            machineIds: [...proposedStage.machineIds],
            version: 1,
          });
          for (const machineId of proposedStage.machineIds)
            state.stageMachineStatuses.set(
              `${stageId}:${machineId}`,
              'planned',
            );
        }

        state.batches.set(batchId, {
          id: batchId,
          locationId,
          productionRunId,
          sequence: proposed.sequence,
          status: initialBatchState,
          derivedWeightLbs: proposed.derivedWeightLbs,
          pulseCapacityLbs: schedule.pulseCapacityLbs,
          pulseMinutes: schedule.pulseMinutes,
          membership: { state: 'mutable' },
          orderIds: [...proposed.orderIds],
          stageIds,
          startedAt: null,
          finishedAt: null,
          version: 1,
        });
        state.activeBatchOrderIds.set(batchId, new Set(proposed.orderIds));
        for (const orderId of proposed.orderIds) {
          const order = state.orders.get(orderId);
          const lifecycle = lifecycleByOrderId.get(orderId);
          if (order === undefined)
            throw new Error('Scheduled order not found.');
          if (
            lifecycle === undefined ||
            lifecycle.expectedVersion !== order.version ||
            lifecycle.persistedState !== order.executionStatus ||
            lifecycle.lifecycle.from !== order.executionStatus ||
            lifecycle.lifecycle.state !== 'scheduled'
          )
            throw new Error('Scheduled order lifecycle changed.');
          state.orders.set(orderId, {
            ...order,
            status: 'scheduled',
            executionStatus: 'scheduled',
            version: order.version + 1,
          });
          state.batchOrderMetadata.set(batchOrderKey(batchId, orderId), {
            placementProvenance: 'initial_schedule',
            pinnedAt: null,
            pinnedBy: null,
          });
          for (const stageId of stageIds) {
            const attemptId = deps.ids.next();
            state.stageAttempts.set(attemptId, {
              id: attemptId,
              productionOrderId: orderId,
              stageRunId: stageId,
              status: initialAttemptState,
            });
          }
        }
      }

      const started: StartScheduleResult = {
        scheduleRunId: schedule.scheduleRunId,
        productionRunId,
        productionBatchIds,
        queueVersion: 1,
        startedAt: now.toISOString(),
        replayed: false,
      };
      state.startResults.set(idempotencyKey, started);
      state.workEvents.set(idempotencyKey, {
        command: clone(idempotency),
        result: clone(started),
        valid: true,
      });
      return clone(started);
    },

    setOrderPriority: async ({
      locationId,
      productionOrderId,
      priority,
      expectedVersion,
    }) => {
      const order = state.orders.get(productionOrderId);
      if (
        order === undefined ||
        order.locationId !== locationId ||
        order.version !== expectedVersion
      )
        return null;
      const updated = { ...order, priority, version: order.version + 1 };
      state.orders.set(order.id, updated);
      return { entityId: order.id, version: updated.version, replayed: false };
    },

    findWorkEvent: async (idempotencyKey) =>
      clone(state.workEvents.get(idempotencyKey) ?? null),

    appendWorkEvent: async (event: WorkEventInput) => {
      if (state.workEvents.has(event.idempotencyKey))
        throw new Error('Idempotency key already exists.');
      state.workEvents.set(event.idempotencyKey, {
        command: clone(event.idempotency.command),
        result: clone(event.idempotency.result),
        valid: true,
      });
    },

    loadBoard: async (locationId, productionRunId, now) => {
      const run = state.runs.get(productionRunId);
      if (run === undefined || run.locationId !== locationId) return null;
      const shift = state.shifts.get(run.productionShiftId);
      if (shift === undefined || shift.locationId !== locationId) return null;

      const batches = [...state.batches.values()]
        .filter((batch) => batch.productionRunId === run.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map(
          (batch): UnevaluatedProductionBoardBatch => ({
            id: batch.id,
            sequence: batch.sequence,
            status: batch.status,
            derivedWeightLbs: batch.derivedWeightLbs,
            pulseCapacityLbs: batch.pulseCapacityLbs,
            pulseMinutes: batch.pulseMinutes,
            membership:
              batch.membership.state === 'mutable'
                ? { state: 'mutable' }
                : {
                    state: 'frozen',
                    frozenAt: new Date(batch.membership.frozenAt),
                    frozenBy: batch.membership.frozenBy,
                  },
            orders: batch.orderIds.map((orderId) => {
              const order = state.orders.get(orderId);
              const metadata = state.batchOrderMetadata.get(
                batchOrderKey(batch.id, orderId),
              );
              if (order === undefined) throw new Error('Order not found.');
              if (metadata === undefined)
                throw new Error('Batch order metadata not found.');
              if (order.bagCount === null)
                throw new Error('Scheduled order is missing bag intake.');
              return {
                id: order.id,
                externalOrderId: order.externalOrderId,
                dueAt: new Date(order.dueAt),
                dueBucket: bucket(order.dueAt, now),
                priority: order.priority,
                derivedWeightLbs: order.derivedWeightLbs,
                bagCount: order.bagCount,
                version: order.version,
                placementProvenance: metadata.placementProvenance,
                pinnedAt:
                  metadata.pinnedAt === null
                    ? null
                    : new Date(metadata.pinnedAt),
                pinnedBy: metadata.pinnedBy,
              };
            }),
            stages: batch.stageIds.map(
              (stageId): UnevaluatedProductionBoardStage => {
                const stage = state.stages.get(stageId);
                if (stage === undefined) throw new Error('Stage not found.');
                return {
                  id: stage.id,
                  productionBatchId: stage.productionBatchId,
                  stage: stage.stage,
                  status: stage.status,
                  plannedStartAt: new Date(stage.plannedStartAt),
                  plannedEndAt: new Date(stage.plannedEndAt),
                  actualStartAt:
                    stage.actualStartAt === null
                      ? null
                      : new Date(stage.actualStartAt),
                  actualEndAt:
                    stage.actualEndAt === null
                      ? null
                      : new Date(stage.actualEndAt),
                  actualStartProvenance:
                    stage.actualStartAt === null
                      ? 'not_recorded'
                      : 'live_observed',
                  actualEndProvenance:
                    stage.actualEndAt === null
                      ? 'not_recorded'
                      : 'live_observed',
                  machineIds: [...stage.machineIds],
                  version: stage.version,
                };
              },
            ),
            version: batch.version,
          }),
        );

      return {
        productionShift: {
          ...clone(shift),
          startsAt: new Date(shift.startsAt),
          endsAt: new Date(shift.endsAt),
        },
        productionRun: {
          id: run.id,
          productionShiftId: run.productionShiftId,
          status: run.status,
          queueVersion: run.queueVersion,
          plannedCompletionAt: new Date(run.plannedCompletionAt),
          overtimeAcknowledgement:
            run.overtimeProposalHash === null ||
            run.overtimeQueueVersion === null ||
            run.overtimeAcknowledgedBy === null ||
            run.overtimeAcknowledgedAt === null
              ? null
              : {
                  proposalHash: run.overtimeProposalHash,
                  queueVersion: run.overtimeQueueVersion,
                  acknowledgedBy: run.overtimeAcknowledgedBy,
                  acknowledgedAt: new Date(run.overtimeAcknowledgedAt),
                },
          version: run.version,
        },
        batches,
        eligibleOrders: [...state.orders.values()]
          .filter(
            (order): order is StoredOrder & { bagCount: number } =>
              order.locationId === locationId &&
              order.status === 'eligible' &&
              order.bagCount !== null,
          )
          .map((order) => ({
            id: order.id,
            externalOrderId: order.externalOrderId,
            dueAt: new Date(order.dueAt),
            dueBucket: bucket(order.dueAt, now),
            priority: order.priority,
            derivedWeightLbs: order.derivedWeightLbs,
            bagCount: order.bagCount,
            version: order.version,
            placement: {
              status: 'awaiting_run' as const,
              reason: 'automatic_placement_not_attempted' as const,
              message:
                'Automatic placement has not completed; it can be retried.',
            },
          })),
        asOf: now,
      };
    },

    loadStageTransitionContext: async (locationId, stageRunId) => {
      const stage = state.stages.get(stageRunId);
      if (stage === undefined || stage.locationId !== locationId) return null;
      const batch = state.batches.get(stage.productionBatchId);
      if (batch === undefined) throw new Error('Batch not found.');
      const stageIndex = batch.stageIds.indexOf(stage.id);
      const previous =
        stageIndex <= 0
          ? undefined
          : state.stages.get(batch.stageIds[stageIndex - 1]!);
      const sameKindAlreadyActive = [...state.stages.values()].some(
        (candidate) =>
          candidate.id !== stage.id &&
          candidate.stage === stage.stage &&
          candidate.status === 'started',
      );
      const overlappingMachineIds = new Set(
        [...state.stages.values()]
          .filter(
            (candidate) =>
              candidate.id !== stage.id &&
              candidate.status !== 'completed' &&
              Date.parse(candidate.plannedStartAt) <
                Date.parse(stage.plannedEndAt) &&
              Date.parse(candidate.plannedEndAt) >
                Date.parse(stage.plannedStartAt),
          )
          .flatMap((candidate) => candidate.machineIds),
      );
      const activeOrders = [
        ...(state.activeBatchOrderIds.get(batch.id) ?? []),
      ].map((orderId) => {
        const order = state.orders.get(orderId);
        if (order === undefined)
          throw new Error('Active production order not found.');
        return {
          id: order.id,
          status: order.status,
          executionStatus: order.executionStatus,
          resolutionState: order.resolutionState,
          version: order.version,
        };
      });

      const context: StageTransitionContext = {
        stage: clone(stage),
        batch: {
          id: batch.id,
          status: batch.status,
          version: batch.version,
        },
        attempts: [...state.stageAttempts.values()]
          .filter((attempt) => attempt.stageRunId === stage.id)
          .map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
          })),
        activeOrders,
        productionRunStatus:
          state.runs.get(batch.productionRunId)?.status ?? 'unknown',
        productionShiftStatus:
          state.shifts.get(
            state.runs.get(batch.productionRunId)?.productionShiftId ?? '',
          )?.status ?? 'unknown',
        productionRunStarted:
          state.runs.get(batch.productionRunId)?.status === 'started',
        batchMembershipFrozen: batch.membership.state === 'frozen',
        previousStageCompleted:
          stageIndex === 0 || previous?.status === 'completed',
        sameKindAlreadyActive,
        batchWeightLbs: batch.derivedWeightLbs,
        machines: [...state.machines.values()].map((machine) => ({
          id: machine.id,
          stationKind: machine.stationKind,
          effectiveCapacityLbs: machine.effectiveCapacityLbs,
          active: machine.active,
          overlaps: overlappingMachineIds.has(machine.id),
        })),
      };
      return context;
    },

    assignStageMachines: async ({
      locationId,
      stageRunId,
      expectedVersion,
      machineIds,
    }) => {
      const stage = state.stages.get(stageRunId);
      if (
        stage === undefined ||
        stage.locationId !== locationId ||
        stage.status !== 'planned' ||
        stage.version !== expectedVersion
      )
        return null;
      const updated = {
        ...stage,
        machineIds: [...machineIds],
        version: stage.version + 1,
      };
      for (const machineId of stage.machineIds)
        state.stageMachineStatuses.delete(`${stage.id}:${machineId}`);
      for (const machineId of machineIds)
        state.stageMachineStatuses.set(`${stage.id}:${machineId}`, 'planned');
      state.stages.set(stage.id, updated);
      return { entityId: stage.id, version: updated.version, replayed: false };
    },

    transitionStage: async ({
      locationId,
      stageRunId,
      expectedVersion,
      stageLifecycle,
      batchId,
      batchExpectedVersion,
      batchState,
      batchLifecycle,
      freezeMembership,
      attemptLifecycles,
      terminalLifecycle,
      actorId,
      now,
    }) => {
      const stage = state.stages.get(stageRunId);
      const batch =
        stage === undefined
          ? undefined
          : state.batches.get(stage.productionBatchId);
      if (
        stage === undefined ||
        stage.locationId !== locationId ||
        stage.version !== expectedVersion ||
        stage.status !== stageLifecycle.from ||
        batch === undefined ||
        batch.id !== batchId ||
        batch.version !== batchExpectedVersion ||
        batch.status !== batchState ||
        (batchLifecycle !== null && batchLifecycle.from !== batch.status)
      )
        return null;
      for (const mutation of attemptLifecycles) {
        const attempt = state.stageAttempts.get(mutation.attemptId);
        if (
          attempt === undefined ||
          attempt.stageRunId !== stage.id ||
          mutation.stageRunId !== stage.id ||
          attempt.status !== mutation.lifecycle.from
        )
          return null;
      }
      const nextState = stageLifecycle.state;
      const updated = {
        ...stage,
        status: nextState,
        ...(nextState === 'started'
          ? { actualStartAt: now.toISOString() }
          : { actualEndAt: now.toISOString() }),
        version: stage.version + 1,
      };
      for (const machineId of stage.machineIds) {
        const key = `${stage.id}:${machineId}`;
        const expected = nextState === 'started' ? 'planned' : 'active';
        if (state.stageMachineStatuses.get(key) !== expected)
          throw new Error('Stage machine assignment state is inconsistent.');
        state.stageMachineStatuses.set(
          key,
          nextState === 'started' ? 'active' : 'completed',
        );
      }
      state.stages.set(stage.id, updated);
      for (const mutation of attemptLifecycles) {
        const attempt = state.stageAttempts.get(mutation.attemptId)!;
        state.stageAttempts.set(attempt.id, {
          ...attempt,
          status: mutation.lifecycle.state,
        });
      }

      if (nextState === 'started') {
        if (batchLifecycle === null)
          throw new Error('Batch lifecycle decision is missing.');
        state.batches.set(batch.id, {
          ...batch,
          status: batchLifecycle.state,
          membership: freezeMembership
            ? {
                state: 'frozen',
                frozenAt: now.toISOString(),
                frozenBy: actorId,
              }
            : batch.membership,
          startedAt: batch.startedAt ?? now.toISOString(),
          version: batch.version + 1,
        });
        if (freezeMembership) {
          const run = state.runs.get(batch.productionRunId);
          if (run === undefined) throw new Error('Production run not found.');
          state.runs.set(run.id, {
            ...run,
            queueVersion: run.queueVersion + 1,
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
            overtimeAcknowledgedBy: null,
            overtimeAcknowledgedAt: null,
          });
        }
      } else if (stage.stage === 'folding_packaging') {
        if (batchLifecycle === null)
          throw new Error('Terminal batch lifecycle decision is missing.');
        state.batches.set(batch.id, {
          ...batch,
          status: batchLifecycle.state,
          finishedAt: now.toISOString(),
          version: batch.version + 1,
        });
        const activeOrderIds = state.activeBatchOrderIds.get(batch.id);
        if (
          activeOrderIds === undefined ||
          activeOrderIds.size !== batch.orderIds.length
        )
          throw new Error(
            'Finished batch active order links are inconsistent.',
          );
        if (terminalLifecycle === null)
          throw new Error('Terminal lifecycle decisions are missing.');
        const orderLifecycleById = new Map(
          terminalLifecycle.orders.map((order) => [
            order.productionOrderId,
            order,
          ]),
        );
        if (
          orderLifecycleById.size !== batch.orderIds.length ||
          batch.orderIds.some((orderId) => !orderLifecycleById.has(orderId))
        )
          throw new Error('Terminal order lifecycles are incomplete.');
        for (const orderId of batch.orderIds) {
          const order = state.orders.get(orderId);
          const lifecycle = orderLifecycleById.get(orderId);
          if (order === undefined || order.status !== 'scheduled')
            throw new Error('Finished batch order is not scheduled.');
          if (
            lifecycle === undefined ||
            lifecycle.persistedState !== order.executionStatus ||
            lifecycle.expectedVersion !== order.version ||
            lifecycle.lifecycle.from !== order.executionStatus ||
            lifecycle.lifecycle.state !== 'finished'
          )
            throw new Error('Finished order lifecycle changed.');
          state.orders.set(orderId, {
            ...order,
            status: 'finished',
            executionStatus: 'finished',
            finishedAt: now.toISOString(),
            version: order.version + 1,
          });
          const bags = state.bagStatuses.get(orderId);
          if (
            order.bagCount === null ||
            bags === undefined ||
            bags.length !== order.bagCount
          )
            throw new Error('Finished production order bags are inconsistent.');
          state.bagStatuses.set(
            orderId,
            bags.map(() => 'finished'),
          );
          activeOrderIds.delete(orderId);
        }
        if (activeOrderIds.size !== 0)
          throw new Error('Finished batch order links changed concurrently.');
        const run = state.runs.get(batch.productionRunId);
        if (run === undefined) throw new Error('Production run not found.');
        if (
          [...state.batches.values()]
            .filter((candidate) => candidate.productionRunId === run.id)
            .every((candidate) =>
              candidate.id === batch.id
                ? true
                : candidate.status === 'finished',
            )
        ) {
          state.runs.set(run.id, {
            ...run,
            status: terminalLifecycle?.run.state ?? run.status,
            completedAt: now.toISOString(),
            version: run.version + 1,
          });
          const shiftRuns = [...state.runs.values()].filter(
            (candidate) =>
              candidate.productionShiftId === run.productionShiftId,
          );
          if (
            shiftRuns.every((candidate) => candidate.status === 'completed')
          ) {
            const shift = state.shifts.get(run.productionShiftId);
            if (shift === undefined)
              throw new Error('Production shift not found.');
            state.shifts.set(shift.id, {
              ...shift,
              status: terminalLifecycle?.shift.state ?? shift.status,
              version: shift.version + 1,
            });
          }
        }
      }

      return { entityId: stage.id, version: updated.version, replayed: false };
    },
  });

  const transactional = <Operations>(
    select: (operations: MemoryProductionOperations) => Operations,
  ): UnitOfWork<Operations> => ({
    transaction: async (work) => {
      const before = clone(state);
      try {
        return await work(select(transactionFor()));
      } catch (error) {
        state = before;
        throw error;
      }
    },
  });

  const allOperations = (operations: MemoryProductionOperations) => operations;

  const orderReadSnapshot = (
    locationId: string,
    now: Date,
  ): ProductionOrderReadItem[] =>
    [...state.orders.values()]
      .filter((order) => order.locationId === locationId)
      .map((order) => ({
        id: order.id,
        locationId: order.locationId,
        externalOrderId: order.externalOrderId,
        dueAt: new Date(order.dueAt),
        dueBucket: bucket(order.dueAt, now),
        priority: order.priority,
        status: order.status,
        derivedWeightLbs: order.derivedWeightLbs,
        bagCount: order.bagCount,
        bagCountProvenance:
          order.bagCount === null ? null : ('operator_intake' as const),
        intakeVersion:
          order.bagCount === null
            ? null
            : Math.max(1, state.intakeVersions.get(order.id) ?? 1),
        version: order.version,
      }));

  const loadMemoryBoardProjection = async (
    locationId: string,
    productionRunId: string,
    now: Date,
  ): Promise<ProductionBoardProjection | null> => {
    const operations = transactionFor();
    const board = await operations.loadBoard(locationId, productionRunId, now);
    if (board === null) return null;

    const stageNextActionContexts = await Promise.all(
      board.batches.flatMap((batch) =>
        batch.stages.map(async (stage) => {
          const context = await operations.loadStageTransitionContext(
            locationId,
            stage.id,
            now,
          );
          if (context === null)
            throw new Error('Stage next-action context was not found.');
          return {
            stageRunId: stage.id,
            entity: {
              state: context.stage.status,
              plannedStartAt: new Date(context.stage.plannedStartAt),
              plannedEndAt: new Date(context.stage.plannedEndAt),
              actualStartAt:
                context.stage.actualStartAt === null
                  ? null
                  : new Date(context.stage.actualStartAt),
            },
            context: {
              now,
              productionRunStarted: context.productionRunStarted,
              previousStageCompleted: context.previousStageCompleted,
              sameKindAlreadyActive: context.sameKindAlreadyActive,
              machinesRequired:
                context.stage.stage === 'washing' ||
                context.stage.stage === 'drying',
              assignedMachineIds: context.stage.machineIds,
              overlappingMachineIds: context.machines
                .filter(
                  (machine) =>
                    context.stage.machineIds.includes(machine.id) &&
                    machine.overlaps,
                )
                .map((machine) => machine.id),
            },
          };
        }),
      ),
    );

    return {
      board,
      stageNextActionContexts,
      orders: orderReadSnapshot(locationId, now),
    };
  };

  const runSummary = (run: StoredRun): ProductionBoardRun => ({
    id: run.id,
    productionShiftId: run.productionShiftId,
    status: run.status,
    queueVersion: run.queueVersion,
    plannedCompletionAt: new Date(run.plannedCompletionAt),
    overtimeAcknowledgement:
      run.overtimeProposalHash === null ||
      run.overtimeQueueVersion === null ||
      run.overtimeAcknowledgedBy === null ||
      run.overtimeAcknowledgedAt === null
        ? null
        : {
            proposalHash: run.overtimeProposalHash,
            queueVersion: run.overtimeQueueVersion,
            acknowledgedBy: run.overtimeAcknowledgedBy,
            acknowledgedAt: new Date(run.overtimeAcknowledgedAt),
          },
    version: run.version,
  });

  const unsupportedTransactional = <Operations>(): UnitOfWork<Operations> => ({
    transaction: async () => {
      throw new Error('This memory repository operation is not supported.');
    },
  });

  const repositories: ProductionRepositories = {
    acceptSchedule:
      transactional<OperationsOf<'acceptSchedule'>>(allOperations),
    applyFulfillmentDemand:
      transactional<OperationsOf<'applyFulfillmentDemand'>>(allOperations),
    advanceProductionStage:
      transactional<OperationsOf<'advanceProductionStage'>>(allOperations),
    assignStageMachines:
      transactional<OperationsOf<'assignStageMachines'>>(allOperations),
    changeProductionAdmission:
      transactional<OperationsOf<'changeProductionAdmission'>>(allOperations),
    changeProductionOrderResolution:
      transactional<OperationsOf<'changeProductionOrderResolution'>>(
        allOperations,
      ),
    resolveSourceClosedFulfillment: {
      findCandidate: (locationId, fulfillmentId) =>
        transactionFor().findCandidate(locationId, fulfillmentId),
    },
    createSchedule:
      transactional<OperationsOf<'createSchedule'>>(allOperations),
    listProductionLocations: {
      listLocations: async ({ allowedLocationIds }) =>
        allowedLocationIds !== null &&
        !allowedLocationIds.includes('location-1')
          ? []
          : [
              {
                id: 'location-1',
                name: 'Synthetic Facility',
                timezone: 'America/New_York',
                isActive: true,
              },
            ],
    },
    listProductionOrders: {
      listOrders: async (command, now) => ({
        tag: 'found',
        value: {
          items: orderReadSnapshot(command.locationId, now).slice(
            0,
            command.limit,
          ),
          nextCursor: null,
          asOf: now,
        },
      }),
    },
    listProductionOrderControl: {
      list: async (_command, now) => ({
        tag: 'found',
        value: {
          items: [],
          counts: { attention: 0, active: 0, all: 0 },
          nextCursor: null,
          asOf: now,
        },
      }),
    },
    productionHistory: {
      listRuns: async (_command, now) => ({
        tag: 'found',
        value: { items: [], nextCursor: null, asOf: now },
      }),
      listActivity: async (_command, now) => ({
        tag: 'found',
        value: { items: [], nextCursor: null, asOf: now },
      }),
      listPlans: async (_command, now) => ({
        tag: 'found',
        value: { items: [], nextCursor: null, asOf: now },
      }),
      loadRun: async () => ({ tag: 'run_not_found' }),
    },
    loadProductionBoard: {
      loadBoardProjection: loadMemoryBoardProjection,
    },
    loadSchedule: {
      loadSchedule: async (locationId, scheduleRunId) =>
        (await transactionFor().loadSchedule(locationId, scheduleRunId))
          ?.schedule ?? null,
    },
    loadProductionWorkspace: {
      loadWorkspace: async (
        locationId,
        requestedShiftId,
        now,
      ): Promise<ProductionWorkspaceReadModel | 'shift_not_found' | null> => {
        if (locationId !== 'location-1') return null;
        const locationRuns = [...state.runs.values()].filter(
          (run) => run.locationId === locationId,
        );
        const activeRuns = locationRuns.filter(
          (run) => run.locationId === locationId && run.status === 'started',
        );
        const committedScheduleRunIds = new Set(
          locationRuns.map((run) => run.scheduleRunId),
        );
        const runShiftIds = new Set(
          locationRuns.map((run) => run.productionShiftId),
        );
        const actionableSchedules = [...state.schedules.values()].filter(
          (schedule) => {
            const shift = state.shifts.get(schedule.productionShiftId);
            return (
              state.scheduleLocationIds.get(schedule.scheduleRunId) ===
                locationId &&
              shift?.locationId === locationId &&
              shift.status === 'open' &&
              Date.parse(shift.endsAt) > now.getTime() &&
              (schedule.status === 'draft' || schedule.status === 'accepted') &&
              !committedScheduleRunIds.has(schedule.scheduleRunId)
            );
          },
        );
        const acceptedSchedules = actionableSchedules.filter(
          (schedule) => schedule.status === 'accepted',
        );
        const openShifts = [...state.shifts.values()].filter(
          (shift) =>
            shift.locationId === locationId &&
            shift.status === 'open' &&
            Date.parse(shift.endsAt) > now.getTime() &&
            !runShiftIds.has(shift.id),
        );
        let currentShift =
          requestedShiftId === undefined
            ? null
            : (state.shifts.get(requestedShiftId) ?? null);
        const candidateShifts: ProductionWorkspaceShiftCandidate[] = [];

        if (requestedShiftId === undefined) {
          if (activeRuns.length === 1)
            currentShift =
              state.shifts.get(activeRuns[0]!.productionShiftId) ?? null;
          else if (activeRuns.length > 1)
            for (const run of activeRuns) {
              const shift = state.shifts.get(run.productionShiftId);
              if (shift !== undefined)
                candidateShifts.push({
                  productionShiftId: shift.id,
                  startsAt: new Date(shift.startsAt),
                  endsAt: new Date(shift.endsAt),
                  reason: 'started_run',
                  productionRunId: run.id,
                  scheduleRunId: run.scheduleRunId,
                });
            }
          else if (acceptedSchedules.length === 1)
            currentShift =
              state.shifts.get(acceptedSchedules[0]!.productionShiftId) ?? null;
          else if (acceptedSchedules.length > 1)
            for (const schedule of acceptedSchedules) {
              const shift = state.shifts.get(schedule.productionShiftId);
              if (shift !== undefined)
                candidateShifts.push({
                  productionShiftId: shift.id,
                  startsAt: new Date(shift.startsAt),
                  endsAt: new Date(shift.endsAt),
                  reason: 'accepted_plan',
                  productionRunId: null,
                  scheduleRunId: schedule.scheduleRunId,
                });
            }
          else if (openShifts.length === 1)
            currentShift = openShifts[0] ?? null;
          else
            for (const shift of openShifts)
              candidateShifts.push({
                productionShiftId: shift.id,
                startsAt: new Date(shift.startsAt),
                endsAt: new Date(shift.endsAt),
                reason: 'open_shift',
                productionRunId: null,
                scheduleRunId:
                  actionableSchedules.find(
                    (schedule) => schedule.productionShiftId === shift.id,
                  )?.scheduleRunId ?? null,
              });
        }

        if (currentShift !== null && currentShift.locationId !== locationId)
          currentShift = null;
        if (requestedShiftId !== undefined && currentShift === null)
          return 'shift_not_found';
        const currentScheduleProposal =
          currentShift === null
            ? null
            : (actionableSchedules.find(
                (schedule) => schedule.productionShiftId === currentShift.id,
              ) ?? null);
        const selectedRun =
          currentShift === null
            ? undefined
            : locationRuns.find(
                (run) => run.productionShiftId === currentShift.id,
              );
        const boardProjection =
          selectedRun === undefined
            ? null
            : await loadMemoryBoardProjection(locationId, selectedRun.id, now);
        return {
          workspace: {
            location: {
              id: locationId,
              name: 'Synthetic Facility',
              timezone: 'America/New_York',
              isActive: true,
            },
            currentShift:
              currentShift === null
                ? null
                : {
                    ...clone(currentShift),
                    startsAt: new Date(currentShift.startsAt),
                    endsAt: new Date(currentShift.endsAt),
                  },
            shiftSelection:
              currentShift === null
                ? null
                : {
                    productionShiftId: currentShift.id,
                    version:
                      state.shiftSelections.get(currentShift.id)?.version ?? 0,
                    selectedOrderIds: [
                      ...(state.shiftSelections.get(currentShift.id)
                        ?.selectedOrderIds ?? []),
                    ].sort(),
                  },
            candidateShifts,
            currentSchedulerConfig:
              clone([...state.configs.values()].at(-1)?.value) ?? null,
            currentScheduleProposal:
              currentScheduleProposal === null
                ? null
                : clone(currentScheduleProposal),
            activeRuns: activeRuns.map(runSummary),
            orders: orderReadSnapshot(locationId, now),
            pendingEligibleOrders: [...state.orders.values()]
              .filter(
                (order): order is StoredOrder & { bagCount: number } =>
                  order.locationId === locationId &&
                  order.status === 'eligible' &&
                  order.bagCount !== null,
              )
              .map((order) => ({
                id: order.id,
                externalOrderId: order.externalOrderId,
                dueAt: order.dueAt,
                dueBucket: bucket(order.dueAt, now),
                priority: order.priority,
                derivedWeightLbs: order.derivedWeightLbs,
                bagCount: order.bagCount,
                version: order.version,
                placement:
                  activeRuns.length > 1
                    ? ({
                        status: 'ambiguous_run',
                        reason: 'multiple_started_runs',
                        message:
                          'More than one production run is active; choose the intended run before placing this order.',
                        candidateProductionRunIds: activeRuns
                          .map((run) => run.id)
                          .sort(),
                      } as const)
                    : ({
                        status: 'awaiting_run',
                        reason:
                          activeRuns.length === 0
                            ? 'no_started_run'
                            : 'automatic_placement_not_attempted',
                        message:
                          activeRuns.length === 0
                            ? 'This order is waiting for a production run to start.'
                            : 'Automatic placement has not completed; it can be retried.',
                      } as const),
              })),
            liveRunChanges: null,
            demandOutlook: null,
            board: null,
            stations: [],
            machines: [...state.machines.values()].map((machine) =>
              clone(machine),
            ),
            asOf: now,
          },
          boardProjection,
          demandOutlookRows: [],
          livePlacement: null,
        };
      },
    },
    manageProductionResources:
      transactional<OperationsOf<'manageProductionResources'>>(allOperations),
    createProductionShift:
      transactional<OperationsOf<'createProductionShift'>>(allOperations),
    updateProductionShift:
      transactional<OperationsOf<'updateProductionShift'>>(allOperations),
    manageBatchMembership: unsupportedTransactional(),
    placeProductionOrder: unsupportedTransactional(),
    publishSchedulerConfig:
      transactional<OperationsOf<'publishSchedulerConfig'>>(allOperations),
    recordOrderIntake:
      transactional<OperationsOf<'recordOrderIntake'>>(allOperations),
    previewProductionOrderBacklog: {
      loadSnapshot: async () => {
        throw new Error(
          'The memory backlog-review repository is not supported.',
        );
      },
    },
    commitProductionOrderBacklog:
      unsupportedTransactional<OperationsOf<'commitProductionOrderBacklog'>>(),
    replaceShiftOrderSelection:
      transactional<OperationsOf<'replaceShiftOrderSelection'>>(allOperations),
    routeProductionOrder: unsupportedTransactional(),
    reconcileProductionBatchProgress:
      unsupportedTransactional<
        OperationsOf<'reconcileProductionBatchProgress'>
      >(),
    setProductionOrderPriority:
      transactional<OperationsOf<'setProductionOrderPriority'>>(allOperations),
    startSchedule: transactional<OperationsOf<'startSchedule'>>(allOperations),
  };

  return {
    repositories,

    seedMachines: (machines) => {
      for (const machine of machines)
        state.machines.set(machine.id, clone(machine));
    },

    inspect: () => clone(state),

    inspectStageTransitionContext: (stageRunId, now) =>
      transactionFor().loadStageTransitionContext(
        'location-1',
        stageRunId,
        now,
      ),

    commitPlacementForTest: (input) => {
      const run = state.runs.get(input.productionRunId);
      const order = state.orders.get(input.productionOrderId);
      if (
        run === undefined ||
        run.locationId !== input.locationId ||
        run.status !== 'started'
      )
        throw new Error('Started production run not found.');
      if (run.queueVersion !== input.proposal.expectedQueueVersion)
        throw new Error('The production queue changed during placement.');
      if (
        order === undefined ||
        order.locationId !== input.locationId ||
        order.status !== 'eligible'
      )
        throw new Error('Eligible production order not found.');
      const runTemplateBatch = [...state.batches.values()].find(
        (batch) => batch.productionRunId === input.productionRunId,
      );
      if (runTemplateBatch === undefined)
        throw new Error('Production run has no batch timing template.');

      const batchIdByProjection = new Map<string, string>();
      let createdBatchId: string | null = null;

      for (const projection of input.proposal.affectedBatches) {
        const stored =
          projection.sourceBatchId === null
            ? undefined
            : state.batches.get(projection.sourceBatchId);
        if (
          stored !== undefined &&
          (stored.locationId !== input.locationId ||
            stored.productionRunId !== input.productionRunId ||
            stored.status !== 'queued' ||
            stored.membership.state !== 'mutable')
        )
          throw new Error('Affected production batch is not mutable.');
        if (projection.sourceBatchId !== null && stored === undefined)
          throw new Error('Affected production batch not found.');

        const batchId = projection.sourceBatchId ?? deps.ids.next();
        batchIdByProjection.set(
          projection.sourceBatchId ?? `new:${projection.sequence}`,
          batchId,
        );
        if (projection.sourceBatchId === null) createdBatchId = batchId;
        if (!projection.changed) continue;

        const existingStageByKind = new Map(
          (stored?.stageIds ?? []).map((stageId) => {
            const stage = state.stages.get(stageId);
            if (stage === undefined || stage.status !== 'planned')
              throw new Error('Affected batch contains a non-planned stage.');
            return [stage.stage, stage] as const;
          }),
        );

        const stageIds = projection.stages.map((projectedStage) => {
          const existingStage = existingStageByKind.get(projectedStage.stage);
          const stageId = existingStage?.id ?? deps.ids.next();
          if (existingStage !== undefined)
            for (const machineId of existingStage.machineIds)
              state.stageMachineStatuses.delete(
                `${existingStage.id}:${machineId}`,
              );
          state.stages.set(stageId, {
            id: stageId,
            locationId: input.locationId,
            productionBatchId: batchId,
            stage: projectedStage.stage,
            status: input.initialStageState,
            plannedStartAt: projectedStage.startsAt,
            plannedEndAt: projectedStage.endsAt,
            actualStartAt: null,
            actualEndAt: null,
            machineIds: [...projectedStage.machineIds],
            version: (existingStage?.version ?? 0) + 1,
          });
          for (const machineId of projectedStage.machineIds)
            state.stageMachineStatuses.set(
              `${stageId}:${machineId}`,
              'planned',
            );
          return stageId;
        });
        state.batches.set(batchId, {
          id: batchId,
          locationId: input.locationId,
          productionRunId: input.productionRunId,
          sequence: projection.sequence,
          status:
            stored === undefined ? input.initialBatchState : projection.status,
          derivedWeightLbs: projection.derivedWeightLbs,
          pulseCapacityLbs:
            stored?.pulseCapacityLbs ?? runTemplateBatch.pulseCapacityLbs,
          pulseMinutes: stored?.pulseMinutes ?? runTemplateBatch.pulseMinutes,
          membership: { state: 'mutable' },
          orderIds: [...projection.orderIds],
          stageIds,
          startedAt: null,
          finishedAt: null,
          version: (stored?.version ?? 0) + 1,
        });
        state.activeBatchOrderIds.set(batchId, new Set(projection.orderIds));
      }

      const targetBatchId =
        input.proposal.target.type === 'existing_batch'
          ? input.proposal.target.batchId
          : createdBatchId;
      if (targetBatchId === null)
        throw new Error('Placement target was not materialized.');
      const targetBatch = state.batches.get(targetBatchId);
      if (targetBatch === undefined)
        throw new Error('Placement target batch is missing.');
      if (
        input.orderLifecycle.productionOrderId !== order.id ||
        input.orderLifecycle.persistedState !== order.executionStatus ||
        input.orderLifecycle.expectedVersion !== order.version ||
        input.orderLifecycle.lifecycle.from !== order.executionStatus
      )
        throw new Error('Placed order lifecycle changed.');
      state.batchOrderMetadata.set(
        batchOrderKey(targetBatchId, input.productionOrderId),
        {
          placementProvenance:
            input.mode === 'manager_exact' ? 'manager_exact' : 'automatic',
          pinnedAt:
            input.mode === 'manager_exact' ? input.now.toISOString() : null,
          pinnedBy: input.mode === 'manager_exact' ? input.actorId : null,
        },
      );
      for (const stageId of targetBatch.stageIds) {
        const attemptId = deps.ids.next();
        state.stageAttempts.set(attemptId, {
          id: attemptId,
          productionOrderId: order.id,
          stageRunId: stageId,
          status: input.initialAttemptState,
        });
      }
      state.orders.set(order.id, {
        ...order,
        status: input.orderLifecycle.lifecycle.state,
        executionStatus: input.orderLifecycle.lifecycle.state,
        version: input.orderLifecycle.expectedVersion + 1,
      });
      const queueVersion = run.queueVersion + 1;
      const acknowledgesOvertime =
        input.proposal.overtime.required && input.overtimeConfirmed;
      state.runs.set(run.id, {
        ...run,
        queueVersion,
        plannedCompletionAt: input.proposal.projectedCompletionAt,
        overtimeProposalHash: acknowledgesOvertime
          ? input.proposal.placementPlanHash
          : null,
        overtimeQueueVersion: acknowledgesOvertime ? queueVersion : null,
        overtimeAcknowledgedBy: acknowledgesOvertime ? input.actorId : null,
        overtimeAcknowledgedAt: acknowledgesOvertime
          ? input.now.toISOString()
          : null,
      });

      return {
        status: 'placed',
        mode: input.mode,
        productionRunId: input.productionRunId,
        productionOrderId: input.productionOrderId,
        productionBatchId: targetBatchId,
        createdBatch: input.proposal.target.type === 'new_batch',
        affectedBatchIds: input.proposal.affectedBatches.map((projection) => {
          const id = batchIdByProjection.get(
            projection.sourceBatchId ?? `new:${projection.sequence}`,
          );
          if (id === undefined)
            throw new Error('Affected batch mapping missing.');
          return id;
        }),
        queueVersion,
        proposalHash: input.proposal.placementPlanHash,
        plannedCompletionAt: input.proposal.projectedCompletionAt,
        overtimeMinutes: input.proposal.overtime.overrunMinutes,
        replayed: false,
      };
    },
  };
};
