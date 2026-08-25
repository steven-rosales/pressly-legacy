import type { StageTransitionContext } from '../../../model/stage-context.ts';
import type {
  AssignStageMachinesCommand,
  AssignStageMachinesDecision,
  AssignStageMachinesPolicy,
} from './types.ts';

export const assignStageMachinesOperationId =
  'production.assign-stage-machines.v1' as const;

const conflict = (
  code: string,
  message: string,
): AssignStageMachinesDecision => ({
  kind: 'reject',
  failure: { kind: 'conflict', code, message, safeMessage: message },
});

const notFound = (
  code: string,
  message: string,
): AssignStageMachinesDecision => ({
  kind: 'reject',
  failure: { kind: 'not_found', code, message, safeMessage: message },
});

export const decideAssignStageMachines = (input: {
  command: AssignStageMachinesCommand;
  facts: StageTransitionContext | null;
  policy: AssignStageMachinesPolicy;
}): AssignStageMachinesDecision => {
  if (input.facts === null)
    return notFound(
      'stage_run_not_found',
      'The production stage was not found.',
    );
  if (
    input.facts.stage.status !== 'planned' ||
    input.facts.stage.version !== input.command.expectedVersion
  )
    return conflict(
      'stage_run_version_conflict',
      'The production stage changed before assignment.',
    );

  const machines = input.facts.machines.filter((machine) =>
    input.command.machineIds.includes(machine.id),
  );
  if (machines.length !== input.command.machineIds.length)
    return notFound(
      'machine_not_found',
      'One or more requested machines are not available.',
    );

  const assignment = input.policy.evaluateMachineAssignment({
    stageKind: input.facts.stage.stage,
    batchWeightLbs: input.facts.batchWeightLbs,
    machines,
  });
  return assignment.tag === 'err'
    ? conflict(assignment.error.code.toLowerCase(), assignment.error.message)
    : { kind: 'commit', machineIds: assignment.value.machineIds };
};
