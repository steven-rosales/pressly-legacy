import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  BatchMembershipAction,
  ManageBatchMembershipCommand,
  ProductionBatchMembershipMutationResult,
} from './manage-batch-membership.model.ts';

export type ManageBatchMembership = (
  command: ManageBatchMembershipCommand,
) => Promise<
  Result<ProductionBatchMembershipMutationResult, ProductionFeatureFailure>
>;

export type BatchMembershipContext = Readonly<{
  productionRun: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
  }>;
  productionBatch: Readonly<{
    id: string;
    status: string;
    version: number;
    membershipFrozenAt: Date | null;
    membershipFrozenBy: string | null;
  }>;
}>;

export type ManageBatchMembershipRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockBatchMembershipContext: (
      locationId: string,
      productionRunId: string,
      productionBatchId: string,
    ) => Promise<BatchMembershipContext | null>;
    changeBatchMembership: (input: {
      action: BatchMembershipAction;
      locationId: string;
      productionRunId: string;
      productionBatchId: string;
      expectedQueueVersion: number;
      expectedBatchVersion: number;
      actorId: string;
      now: Date;
    }) => Promise<ProductionBatchMembershipMutationResult>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
