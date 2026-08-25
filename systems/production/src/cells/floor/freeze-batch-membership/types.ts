import type { ProductionRules } from '../../../model/public.ts';

export type FreezeBatchMembershipCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type FrozenBatchMembership = Readonly<{
  state: 'frozen';
  frozenAt: string;
  frozenBy: string;
}>;

export type FreezeBatchMembershipResult = Readonly<{
  productionRunId: string;
  productionBatchId: string;
  queueVersion: number;
  batchVersion: number;
  membership: FrozenBatchMembership;
  replayed: boolean;
}>;

export type FreezeBatchMembershipExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type FreezeBatchMembershipFacts = Readonly<{
  productionRun: Readonly<{ id: string; status: string; queueVersion: number }>;
  productionBatch: Readonly<{
    id: string;
    status: string;
    version: number;
    membershipFrozenAt: Date | null;
    membershipFrozenBy: string | null;
  }>;
}>;

export type FreezeBatchMembershipPolicy = Pick<
  ProductionRules,
  'evaluateBatchMembershipTransition'
>;

export type FreezeBatchMembershipDecision =
  | Readonly<{ kind: 'commit' }>
  | Readonly<{
      kind: 'reject';
      failure: FreezeBatchMembershipExpectedFailure;
    }>;
