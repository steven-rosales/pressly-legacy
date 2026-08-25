import type { ProductionRules } from '../../../model/public.ts';

export type SetOrderPriorityCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  priority: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type SetOrderPriorityResult = Readonly<{
  entityId: string;
  version: number;
  replayed: boolean;
}>;

export type SetOrderPriorityExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type SetOrderPriorityFacts = Readonly<{
  productionOrderId: string;
  version: number;
  resolutionState: string;
}>;

export type SetOrderPriorityPolicy = Pick<
  ProductionRules,
  'evaluateProductionOrderOperationalAccess'
>;

export type SetOrderPriorityDecision =
  | Readonly<{ kind: 'commit' }>
  | Readonly<{
      kind: 'reject';
      failure: SetOrderPriorityExpectedFailure;
    }>;
