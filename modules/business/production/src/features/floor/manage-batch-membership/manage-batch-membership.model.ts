export type BatchMembershipAction = 'freeze' | 'unfreeze';

export type ManageBatchMembershipCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  idempotencyKey: string;
  action: BatchMembershipAction;
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
}>;

export type ProductionBatchMembership =
  | Readonly<{ state: 'mutable' }>
  | Readonly<{
      state: 'frozen';
      frozenAt: string;
      frozenBy: string;
    }>;

export type ProductionBatchMembershipMutationResult = Readonly<{
  productionRunId: string;
  productionBatchId: string;
  queueVersion: number;
  batchVersion: number;
  membership: ProductionBatchMembership;
  replayed: boolean;
}>;
