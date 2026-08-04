export {
  freezeProductionBatchRequestSchema,
  productionBatchMembershipMutationResultSchema,
  productionIdSchema,
  productionRunParamsSchema,
  unfreezeProductionBatchRequestSchema,
} from '@pressly/contracts/production';
import type { ProductionBatchMembershipMutationResult as ProductionBatchMembershipMutationWireResult } from '@pressly/contracts/production';
import type { ProductionBatchMembershipMutationResult } from './manage-batch-membership.model.ts';

export const toProductionBatchMembershipMutationResult = (
  result: ProductionBatchMembershipMutationResult,
): ProductionBatchMembershipMutationWireResult => ({
  productionRunId: result.productionRunId,
  productionBatchId: result.productionBatchId,
  queueVersion: result.queueVersion,
  batchVersion: result.batchVersion,
  membership:
    result.membership.state === 'mutable'
      ? { state: 'mutable' }
      : {
          state: 'frozen',
          frozenAt: result.membership.frozenAt,
          frozenBy: result.membership.frozenBy,
        },
  replayed: result.replayed,
});
