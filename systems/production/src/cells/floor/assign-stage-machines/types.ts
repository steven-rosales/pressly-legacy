import type { ProductionRules } from '../../../model/rules.ts';

export type AssignStageMachinesCommand = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  machineIds: readonly string[];
}>;

export type AssignStageMachinesResult = Readonly<{
  entityId: string;
  version: number;
  replayed: boolean;
}>;

export type AssignStageMachinesExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type AssignStageMachinesPolicy = Pick<
  ProductionRules,
  'evaluateMachineAssignment'
>;

export type AssignStageMachinesDecision =
  | Readonly<{ kind: 'commit'; machineIds: readonly string[] }>
  | Readonly<{
      kind: 'reject';
      failure: AssignStageMachinesExpectedFailure;
    }>;
