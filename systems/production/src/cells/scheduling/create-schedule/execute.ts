import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  ScheduleProposal,
  SchedulingInput,
  SchedulingOutput,
} from '../../../model/production-schedule/model.ts';
import {
  decideCurrentPlanSupersession,
  decidePlanningState,
  decidePlanningWindow,
  decideSchedulingInput,
} from './decide.ts';
import { idempotencyConflict, scheduleRevisionConflict } from './failures.ts';
import type {
  CreateScheduleCommand,
  CreateScheduleExpectedFailure,
  CreateSchedulePolicy,
  CreateScheduleScheduler,
  CurrentSchedule,
  ScheduleSupersession,
} from './types.ts';

export type CreateScheduleWorkEventCommand = Readonly<{
  operation: 'schedule_computed';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'schedule_run'; entityId: null }>;
  expectedVersion: null;
  payload: Readonly<{ productionShiftId: string; schedulerConfigId: string }>;
}>;
export type CreateScheduleReplay =
  | { kind: 'miss' }
  | { kind: 'conflict' }
  | { kind: 'replay'; result: ScheduleProposal };
export type CreateScheduleIdempotency<Stored> = Readonly<{
  resolveReplay: (
    stored: Stored | null,
    expected: CreateScheduleWorkEventCommand,
  ) => CreateScheduleReplay;
}>;
export type CreateScheduleWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'schedule_computed';
  entityType: 'schedule_run';
  entityId: string;
  actorId: string;
  idempotencyKey: string;
  payload: Readonly<{
    productionShiftId: string;
    inputSnapshotHash: string;
    outputPlanHash: string;
  }>;
  idempotency: Readonly<{
    command: CreateScheduleWorkEventCommand;
    result: ScheduleProposal;
  }>;
}>;
export type SaveScheduleOutcome =
  | { kind: 'saved'; proposal: ScheduleProposal }
  | { kind: 'conflict' };
export type CreateScheduleTransactionRepository<Stored> = Readonly<{
  findWorkEvent: (key: string) => Promise<Stored | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  lockShiftForPlanning: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<'available' | 'not_found' | 'run_exists'>;
  loadSchedulingInput: (
    command: Pick<
      CreateScheduleCommand,
      'locationId' | 'productionShiftId' | 'schedulerConfigId'
    >,
  ) => Promise<
    SchedulingInput | 'selection_empty' | 'selection_invalid' | null
  >;
  loadCurrentPlan: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<CurrentSchedule | null>;
  saveSchedule: (input: {
    locationId: string;
    id: string;
    schedulingInput: SchedulingInput;
    output: SchedulingOutput;
    initialStatus: 'draft';
    supersession: ScheduleSupersession | null;
    now: Date;
  }) => Promise<SaveScheduleOutcome>;
  appendWorkEvent: (event: CreateScheduleWorkEventInput) => Promise<void>;
}>;
export type CreateScheduleRepository<Stored> = Readonly<{
  transaction: (
    work: (
      repo: CreateScheduleTransactionRepository<Stored>,
    ) => Promise<CellOutcome<ScheduleProposal, CreateScheduleExpectedFailure>>,
  ) => Promise<CellOutcome<ScheduleProposal, CreateScheduleExpectedFailure>>;
}>;
export type CreateScheduleDependencies<Stored> = Readonly<{
  repo: CreateScheduleRepository<Stored>;
  idempotency: CreateScheduleIdempotency<Stored>;
  scheduler: CreateScheduleScheduler;
  policy: CreateSchedulePolicy;
  clock: Readonly<{ now: () => Date }>;
  ids: IdSource;
  signals?: Readonly<{ planSuperseded: () => void }>;
}>;
export type ExecuteCreateSchedule = (
  command: CreateScheduleCommand,
) => Promise<CellOutcome<ScheduleProposal, CreateScheduleExpectedFailure>>;
const ok = (value: ScheduleProposal) => ({ kind: 'success', value }) as const;
const err = (failure: CreateScheduleExpectedFailure) =>
  ({ kind: 'failure', failure }) as const;
const envelope = (
  command: CreateScheduleCommand,
): CreateScheduleWorkEventCommand => ({
  operation: 'schedule_computed',
  locationId: command.locationId,
  actorId: command.actorId,
  target: { entityType: 'schedule_run', entityId: null },
  expectedVersion: null,
  payload: {
    productionShiftId: command.productionShiftId,
    schedulerConfigId: command.schedulerConfigId,
  },
});

export const makeExecuteCreateSchedule =
  <Stored>(deps: CreateScheduleDependencies<Stored>): ExecuteCreateSchedule =>
  async (command) => {
    let replacedCurrentPlan = false;
    let outcome: CellOutcome<ScheduleProposal, CreateScheduleExpectedFailure>;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const identity = envelope(command);
        const before = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          identity,
        );
        if (before.kind === 'conflict') return err(idempotencyConflict());
        if (before.kind === 'replay') return ok(before.result);
        await repo.lockLocationScheduling(command.locationId);
        const after = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          identity,
        );
        if (after.kind === 'conflict') return err(idempotencyConflict());
        if (after.kind === 'replay') return ok(after.result);
        const planningFailure = decidePlanningState(
          await repo.lockShiftForPlanning(
            command.locationId,
            command.productionShiftId,
          ),
        );
        if (planningFailure !== null) return err(planningFailure);
        const inputDecision = decideSchedulingInput(
          await repo.loadSchedulingInput(command),
        );
        if (inputDecision.kind === 'reject') return err(inputDecision.failure);
        const now = deps.clock.now();
        const windowFailure = decidePlanningWindow({
          schedulingInput: inputDecision.input,
          now,
          policy: deps.policy,
        });
        if (windowFailure !== null) return err(windowFailure);
        const output = deps.scheduler.propose(inputDecision.input);
        const supersession = decideCurrentPlanSupersession({
          current: await repo.loadCurrentPlan(
            command.locationId,
            command.productionShiftId,
          ),
          policy: deps.policy,
        });
        if (supersession.kind === 'reject') return err(supersession.failure);
        const saved = await repo.saveSchedule({
          locationId: command.locationId,
          id: deps.ids.next(),
          schedulingInput: inputDecision.input,
          output,
          initialStatus: deps.policy.initialScheduleRevisionState,
          supersession: supersession.supersession,
          now,
        });
        if (saved.kind === 'conflict') return err(scheduleRevisionConflict());
        replacedCurrentPlan = supersession.supersession !== null;
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'schedule_computed',
          entityType: 'schedule_run',
          entityId: saved.proposal.scheduleRunId,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: {
            productionShiftId: saved.proposal.productionShiftId,
            inputSnapshotHash: saved.proposal.inputSnapshotHash,
            outputPlanHash: saved.proposal.outputPlanHash,
          },
          idempotency: { command: identity, result: saved.proposal },
        });
        return ok(saved.proposal);
      });
      if (outcome.kind === 'success' && replacedCurrentPlan)
        deps.signals?.planSuperseded();
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'schedule_create_failed',
          message: 'The schedule proposal could not be created.',
          safeMessage: 'The schedule proposal could not be created.',
          status: 503,
          cause,
        }),
      );
    }
    return outcome;
  };
