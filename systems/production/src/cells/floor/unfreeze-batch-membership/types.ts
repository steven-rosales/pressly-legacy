import type { ProductionRules } from '../../../model/public.ts';

export type UnfreezeBatchMembershipCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type UnfreezeBatchMembershipResult = Readonly<{
  productionRunId: string;
  productionBatchId: string;
  queueVersion: number;
  batchVersion: number;
  membership: Readonly<{ state: 'mutable' }>;
  replayed: boolean;
}>;

export type UnfreezeBatchMembershipExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type UnfreezeBatchMembershipFacts = Readonly<{
  productionRun: Readonly<{ id: string; status: string; queueVersion: number }>;
  productionBatch: Readonly<{
    id: string;
    status: string;
    version: number;
    membershipFrozenAt: Date | null;
    membershipFrozenBy: string | null;
  }>;
}>;

export type UnfreezeBatchMembershipPolicy = Pick<
  ProductionRules,
  'evaluateBatchMembershipTransition'
>;

export type UnfreezeBatchMembershipDecision =
  | Readonly<{ kind: 'commit' }>
  | Readonly<{
      kind: 'reject';
      failure: UnfreezeBatchMembershipExpectedFailure;
    }>;
