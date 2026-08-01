import type {
  FreezeProductionBatchCommand,
  ProductionBatchMembershipMutationResult,
  UnfreezeProductionBatchCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type BatchMembershipAction = 'freeze' | 'unfreeze';

type BatchMembershipCommand =
  | FreezeProductionBatchCommand
  | UnfreezeProductionBatchCommand;

export type ManageBatchMembership = (
  command: BatchMembershipCommand & {
    action: BatchMembershipAction;
    actorId: string;
    authorizedAction: 'production:queue' | 'production:override';
  },
) => Promise<Result<ProductionBatchMembershipMutationResult, AppError>>;

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

export type ManageBatchMembershipRepository = Transactional<
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
