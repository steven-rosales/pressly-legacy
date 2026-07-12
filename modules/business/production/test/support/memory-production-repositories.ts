import type {
  AcceptScheduleResult,
  ProductionBatch,
  ProductionMachine,
  ProductionShift,
  ProductionWorkspace,
  ScheduleProposal,
  SchedulerConfig,
  StageRun,
} from '@pressly/contracts';
import type { ProductionRepositories } from '../../src/main.ts';
import type {
  IdPort,
  SchedulingInput,
  StageTransitionContext,
  StoredWorkEvent,
  StoredStage,
  Transactional,
  WorkEventInput,
} from '../../src/production.port.ts';
import type {
  ApplyOrderDemandCommand,
  StoredOrderDemand,
} from '../../src/apply-order-demand/apply-order-demand.port.ts';

type StoredOrder = {
  id: string;
  locationId: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: string;
  dueBucket: 'today' | 'tomorrow' | 'later';
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number | null;
  finishedAt: string | null;
  version: number;
  status:
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
  status: 'planned' | 'started' | 'completed';
  completedAt: string | null;
  version: number;
};

type StoredBatch = Omit<ProductionBatch, 'orders' | 'stages'> & {
  locationId: string;
  productionRunId: string;
  orderIds: string[];
  stageIds: string[];
  startedAt: string | null;
  finishedAt: string | null;
};

type State = {
  demands: Map<string, StoredOrderDemand>;
  orders: Map<string, StoredOrder>;
  configs: Map<
    string,
    Readonly<{ locationId: string; value: SchedulerConfig }>
  >;
  shifts: Map<string, ProductionShift>;
  machines: Map<string, ProductionMachine>;
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
  stageMachineStatuses: Map<string, 'planned' | 'active' | 'completed'>;
  bagStatuses: Map<string, ('eligible' | 'finished')[]>;
  activeBatchOrderIds: Map<string, Set<string>>;
  workEvents: Map<string, StoredWorkEvent>;
  acceptanceResults: Map<string, AcceptScheduleResult>;
  intakeVersions: Map<string, number>;
};

const emptyState = (): State => ({
  demands: new Map(),
  orders: new Map(),
  configs: new Map(),
  shifts: new Map(),
  machines: new Map(),
  schedules: new Map(),
  scheduleLocationIds: new Map(),
  schedulingInputs: new Map(),
  runs: new Map(),
  runIdBySchedule: new Map(),
  batches: new Map(),
  stages: new Map(),
  stageMachineStatuses: new Map(),
  bagStatuses: new Map(),
  activeBatchOrderIds: new Map(),
  workEvents: new Map(),
  acceptanceResults: new Map(),
  intakeVersions: new Map(),
});

const bucket = (dueAt: string, now: Date): 'today' | 'tomorrow' | 'later' => {
  const day = 86_400_000;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const due = new Date(dueAt);
  const dueDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
  );
  const distance = Math.floor((dueDay - today) / day);

  return distance <= 0 ? 'today' : distance === 1 ? 'tomorrow' : 'later';
};

const clone = <T>(value: T): T => structuredClone(value);

type OperationsOf<Key extends keyof ProductionRepositories> =
  ProductionRepositories[Key] extends Transactional<infer Operations>
    ? Operations
    : never;

type MemoryProductionOperations = OperationsOf<'acceptSchedule'> &
  OperationsOf<'advanceProductionStage'> &
  OperationsOf<'assignStageMachines'> &
  OperationsOf<'createSchedule'> &
  OperationsOf<'loadProductionBoard'> &
  OperationsOf<'manageProductionResources'> &
  OperationsOf<'manageProductionShift'> &
  OperationsOf<'applyOrderDemand'> &
  OperationsOf<'publishSchedulerConfig'> &
  OperationsOf<'recordOrderIntake'> &
  OperationsOf<'setProductionOrderPriority'> &
  OperationsOf<'startProductionRun'>;

export type MemoryProductionRepositories = Readonly<{
  repositories: ProductionRepositories;
  seedMachines: (machines: readonly ProductionMachine[]) => void;
  inspect: () => State;
  inspectStageTransitionContext: (
    stageRunId: string,
    now: Date,
  ) => Promise<StageTransitionContext | null>;
}>;

export const makeMemoryProductionRepositories = (deps: {
  ids: IdPort;
}): MemoryProductionRepositories => {
  let state = emptyState();

  const transactionFor = (): MemoryProductionOperations => ({
    locationIsActive: async (locationId) => locationId === 'location-1',

    lockDemand: async () => undefined,

    loadDemand: async (demandKey) =>
      clone(state.demands.get(demandKey) ?? null),

    applyDemand: async ({
      command,
      orderDemandId,
      productionStatus,
      now,
    }: {
      command: ApplyOrderDemandCommand;
      orderDemandId: string;
      productionStatus: 'eligible' | 'intake_pending' | 'ineligible';
      now: Date;
    }) => {
      const stored = state.demands.get(command.demandKey);
      let productionOrderId = stored?.productionOrderId ?? null;
      const previous =
        productionOrderId === null
          ? undefined
          : state.orders.get(productionOrderId);

      if (productionStatus !== 'ineligible' || previous !== undefined) {
        productionOrderId ??= deps.ids.next();
        const bagCount = previous?.bagCount ?? command.bagCount;
        state.orders.set(productionOrderId, {
          id: productionOrderId,
          locationId: command.locationId,
          orderDemandId,
          externalOrderId: command.displayReference,
          dueAt: command.dueAt,
          dueBucket: bucket(command.dueAt, now),
          priority: previous?.priority ?? false,
          derivedWeightLbs: command.estimatedWeightLbs,
          bagCount,
          finishedAt: previous?.finishedAt ?? null,
          version: (previous?.version ?? 0) + 1,
          status: productionStatus,
        });
        if (bagCount !== null && !state.intakeVersions.has(productionOrderId))
          state.intakeVersions.set(productionOrderId, 1);
      }

      const demand: StoredOrderDemand = {
        orderDemandId,
        productionOrderId,
        locationId: command.locationId,
        revisionAt: command.revisionAt,
        revisionHash: command.revisionHash,
        bagCount:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.bagCount ?? null),
        productionStatus:
          productionOrderId === null
            ? null
            : (state.orders.get(productionOrderId)?.status ?? null),
      };
      state.demands.set(command.demandKey, demand);
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

    lockOrder: async (locationId, orderId) => {
      const order = state.orders.get(orderId);
      return order === undefined || order.locationId !== locationId
        ? null
        : {
            orderId,
            locationId,
            productionStatus: order.status,
            productionVersion: order.version,
            intakeVersion: state.intakeVersions.get(orderId) ?? 0,
            derivedWeightLbs: order.derivedWeightLbs,
            demandState: 'ready_for_production',
          };
    },

    recordIntake: async ({
      locationId,
      orderId,
      bagCount,
      expectedVersion,
      currentIntakeVersion,
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
        status: 'eligible',
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

    loadSchedulingInput: async ({
      locationId,
      productionShiftId,
      schedulerConfigId,
      horizonEnd,
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

      return {
        orders: [...state.orders.values()]
          .filter(
            (order): order is StoredOrder & { bagCount: number } =>
              order.locationId === locationId &&
              order.status === 'eligible' &&
              order.bagCount !== null,
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
            ): machine is ProductionMachine & {
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
        horizonEnd,
      };
    },

    saveSchedule: async ({ locationId, id, schedulingInput, output, now }) => {
      const existing = [...state.schedules.values()].find(
        (schedule) =>
          schedule.productionShiftId === schedulingInput.shift.id &&
          schedule.schedulerConfigId === schedulingInput.config.id &&
          schedule.inputSnapshotHash === output.inputSnapshotHash &&
          schedule.outputPlanHash === output.outputPlanHash,
      );
      if (existing !== undefined) return clone(existing);

      const schedule: ScheduleProposal = {
        scheduleRunId: id,
        productionShiftId: schedulingInput.shift.id,
        schedulerConfigId: schedulingInput.config.id,
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
          code: warning.code,
          message: warning.message,
          blocking: warning.blocking,
          ...(warning.orderIds === undefined
            ? {}
            : { orderIds: [...warning.orderIds] }),
        })),
        createdAt: now.toISOString(),
        acceptedAt: null,
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
        : clone({ schedule, inputSnapshot });
    },

    lockAndValidateSelectedOrders: async (locationId, record) => {
      const selectedOrderIds = record.schedule.batches.flatMap(
        (batch) => batch.orderIds,
      );
      if (new Set(selectedOrderIds).size !== selectedOrderIds.length)
        return false;
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (snapshots.size !== record.inputSnapshot.orders.length) return false;
      return selectedOrderIds.every((orderId) => {
        const order = state.orders.get(orderId);
        const snapshot = snapshots.get(orderId);
        return (
          order !== undefined &&
          snapshot !== undefined &&
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

    acceptSchedule: async (
      locationId,
      schedule,
      actorId,
      idempotencyKey,
      idempotency,
      now,
    ) => {
      if (state.scheduleLocationIds.get(schedule.scheduleRunId) !== locationId)
        throw new Error('Schedule location mismatch.');
      const replay = state.acceptanceResults.get(idempotencyKey);
      if (replay !== undefined) return { ...clone(replay), replayed: true };

      const existingRunId = state.runIdBySchedule.get(schedule.scheduleRunId);
      if (existingRunId !== undefined) {
        const batchIds = [...state.batches.values()]
          .filter((batch) => batch.productionRunId === existingRunId)
          .map((batch) => batch.id);
        return {
          productionRunId: existingRunId,
          productionBatchIds: batchIds,
          replayed: true,
        };
      }

      const productionRunId = deps.ids.next();
      const productionBatchIds: string[] = [];
      state.runs.set(productionRunId, {
        id: productionRunId,
        locationId,
        scheduleRunId: schedule.scheduleRunId,
        productionShiftId: schedule.productionShiftId,
        status: 'planned',
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
            status: 'planned',
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
          status: 'queued',
          derivedWeightLbs: proposed.derivedWeightLbs,
          pulseCapacityLbs: schedule.pulseCapacityLbs,
          pulseMinutes: schedule.pulseMinutes,
          orderIds: [...proposed.orderIds],
          stageIds,
          startedAt: null,
          finishedAt: null,
          version: 1,
        });
        state.activeBatchOrderIds.set(batchId, new Set(proposed.orderIds));

        for (const orderId of proposed.orderIds) {
          const order = state.orders.get(orderId);
          if (order === undefined)
            throw new Error('Scheduled order not found.');
          state.orders.set(orderId, {
            ...order,
            status: 'scheduled',
            version: order.version + 1,
          });
        }
      }

      state.schedules.set(schedule.scheduleRunId, {
        ...schedule,
        status: 'accepted',
        acceptedAt: now.toISOString(),
      });
      const acceptance = {
        productionRunId,
        productionBatchIds,
        replayed: false,
      };
      state.acceptanceResults.set(idempotencyKey, acceptance);
      state.workEvents.set(idempotencyKey, {
        command: clone(idempotency),
        result: clone(acceptance),
        valid: true,
      });
      void actorId;
      return clone(acceptance);
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

    loadBoard: async (locationId, productionShiftId, now) => {
      const shift = state.shifts.get(productionShiftId);
      if (shift === undefined || shift.locationId !== locationId) return null;
      const run = [...state.runs.values()].find(
        (candidate) =>
          candidate.locationId === locationId &&
          candidate.productionShiftId === productionShiftId,
      );
      const batches =
        run === undefined
          ? []
          : [...state.batches.values()]
              .filter((batch) => batch.productionRunId === run.id)
              .sort((left, right) => left.sequence - right.sequence)
              .map(
                (batch): ProductionBatch => ({
                  id: batch.id,
                  sequence: batch.sequence,
                  status: batch.status,
                  derivedWeightLbs: batch.derivedWeightLbs,
                  pulseCapacityLbs: batch.pulseCapacityLbs,
                  pulseMinutes: batch.pulseMinutes,
                  orders: batch.orderIds.map((orderId) => {
                    const order = state.orders.get(orderId);
                    if (order === undefined)
                      throw new Error('Order not found.');
                    if (order.bagCount === null)
                      throw new Error('Scheduled order is missing bag intake.');
                    const {
                      orderDemandId: _orderDemandId,
                      locationId: _locationId,
                      status: _status,
                      ...summary
                    } = order;
                    return {
                      ...summary,
                      bagCount: order.bagCount,
                      dueBucket: bucket(summary.dueAt, now),
                    };
                  }),
                  stages: batch.stageIds.map((stageId): StageRun => {
                    const stage = state.stages.get(stageId);
                    if (stage === undefined)
                      throw new Error('Stage not found.');
                    return {
                      id: stage.id,
                      productionBatchId: stage.productionBatchId,
                      stage: stage.stage,
                      status: stage.status,
                      plannedStartAt: stage.plannedStartAt,
                      plannedEndAt: stage.plannedEndAt,
                      actualStartAt: stage.actualStartAt,
                      actualEndAt: stage.actualEndAt,
                      machineIds: [...stage.machineIds],
                      allowedActions: [],
                      version: stage.version,
                    };
                  }),
                  version: batch.version,
                }),
              );

      return {
        productionShift: clone(shift),
        productionRun:
          run === undefined
            ? null
            : {
                id: run.id,
                status: run.status,
                allowedActions: run.status === 'planned' ? ['start'] : [],
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
          .map(
            ({
              orderDemandId: _orderDemandId,
              locationId: _locationId,
              status: _status,
              ...order
            }) => ({
              ...order,
              dueBucket: bucket(order.dueAt, now),
            }),
          ),
        asOf: now.toISOString(),
      };
    },

    loadRun: async (locationId, productionRunId) => {
      const run = state.runs.get(productionRunId);
      return run === undefined || run.locationId !== locationId
        ? null
        : { id: run.id, status: run.status, version: run.version };
    },

    startRun: async ({ locationId, productionRunId, expectedVersion }) => {
      const run = state.runs.get(productionRunId);
      if (
        run === undefined ||
        run.locationId !== locationId ||
        run.status !== 'planned' ||
        run.version !== expectedVersion
      )
        return null;
      const updated = {
        ...run,
        status: 'started' as const,
        version: run.version + 1,
      };
      state.runs.set(run.id, updated);
      return { entityId: run.id, version: updated.version, replayed: false };
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

      const context: StageTransitionContext = {
        stage: clone(stage),
        productionRunStarted:
          state.runs.get(batch.productionRunId)?.status === 'started',
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
      nextState,
      now,
    }) => {
      const stage = state.stages.get(stageRunId);
      if (
        stage === undefined ||
        stage.locationId !== locationId ||
        stage.version !== expectedVersion
      )
        return null;
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
      const batch = state.batches.get(stage.productionBatchId);
      if (batch === undefined) throw new Error('Batch not found.');

      if (nextState === 'started')
        state.batches.set(batch.id, {
          ...batch,
          status: stage.stage,
          startedAt: batch.startedAt ?? now.toISOString(),
          version: batch.version + 1,
        });
      else if (stage.stage === 'folding_packaging') {
        state.batches.set(batch.id, {
          ...batch,
          status: 'finished',
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
        for (const orderId of batch.orderIds) {
          const order = state.orders.get(orderId);
          if (order === undefined || order.status !== 'scheduled')
            throw new Error('Finished batch order is not scheduled.');
          state.orders.set(orderId, {
            ...order,
            status: 'finished',
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
            status: 'completed',
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
              status: 'closed',
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
  ): Transactional<Operations> => ({
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

  const repositories: ProductionRepositories = {
    acceptSchedule:
      transactional<OperationsOf<'acceptSchedule'>>(allOperations),
    applyOrderDemand:
      transactional<OperationsOf<'applyOrderDemand'>>(allOperations),
    advanceProductionStage:
      transactional<OperationsOf<'advanceProductionStage'>>(allOperations),
    assignStageMachines:
      transactional<OperationsOf<'assignStageMachines'>>(allOperations),
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
          items: [...state.orders.values()]
            .filter((order) => order.locationId === command.locationId)
            .slice(0, command.limit)
            .map((order) => ({
              id: order.id,
              locationId: order.locationId,
              externalOrderId: order.externalOrderId,
              dueAt: order.dueAt,
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
                  : (state.intakeVersions.get(order.id) ?? 1),
              version: order.version,
            })),
          nextCursor: null,
          asOf: now.toISOString(),
        },
      }),
    },
    loadProductionBoard:
      transactional<OperationsOf<'loadProductionBoard'>>(allOperations),
    loadSchedule: {
      loadSchedule: async (locationId, scheduleRunId) =>
        (await transactionFor().loadSchedule(locationId, scheduleRunId))
          ?.schedule ?? null,
    },
    loadProductionWorkspace: {
      loadWorkspace: async (
        locationId,
        now,
      ): Promise<ProductionWorkspace | null> => {
        if (locationId !== 'location-1') return null;
        const currentShift = [...state.shifts.values()].at(-1) ?? null;
        const latestScheduleProposal =
          [...state.schedules.values()].at(-1) ?? null;
        const activeRun = [...state.runs.values()].at(-1);
        const board =
          currentShift === null
            ? null
            : await transactionFor().loadBoard(
                locationId,
                currentShift.id,
                now,
              );
        return {
          location: {
            id: locationId,
            name: 'Synthetic Facility',
            timezone: 'America/New_York',
            isActive: true,
          },
          currentShift: clone(currentShift),
          currentSchedulerConfig:
            clone([...state.configs.values()].at(-1)?.value) ?? null,
          latestScheduleProposal: clone(latestScheduleProposal),
          activeRun:
            activeRun === undefined
              ? null
              : {
                  id: activeRun.id,
                  productionShiftId: activeRun.productionShiftId,
                  status: activeRun.status,
                  version: activeRun.version,
                },
          board,
          stations: [],
          machines: [...state.machines.values()].map((machine) =>
            clone(machine),
          ),
          asOf: now.toISOString(),
        };
      },
    },
    manageProductionResources:
      transactional<OperationsOf<'manageProductionResources'>>(allOperations),
    manageProductionShift:
      transactional<OperationsOf<'manageProductionShift'>>(allOperations),
    publishSchedulerConfig:
      transactional<OperationsOf<'publishSchedulerConfig'>>(allOperations),
    recordOrderIntake:
      transactional<OperationsOf<'recordOrderIntake'>>(allOperations),
    setProductionOrderPriority:
      transactional<OperationsOf<'setProductionOrderPriority'>>(allOperations),
    startProductionRun:
      transactional<OperationsOf<'startProductionRun'>>(allOperations),
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
  };
};
