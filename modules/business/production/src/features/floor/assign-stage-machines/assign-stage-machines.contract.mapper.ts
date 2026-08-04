export {
  assignStageMachinesRequestSchema,
  productionMutationResultSchema,
  productionStageParamsSchema,
} from '@pressly/contracts/production';
import type { ProductionMutationResult as ProductionMutationWireResult } from '@pressly/contracts/production';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';

export const toAssignStageMachinesResult = (
  result: ProductionMutationResult,
): ProductionMutationWireResult => ({
  entityId: result.entityId,
  version: result.version,
  replayed: result.replayed,
});
