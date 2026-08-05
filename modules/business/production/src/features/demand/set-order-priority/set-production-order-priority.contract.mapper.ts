import type { ProductionMutationResult as ProductionMutationWireResult } from '@pressly/contracts/production';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';

export const toProductionOrderPriorityResult = (
  result: ProductionMutationResult,
): ProductionMutationWireResult => ({
  entityId: result.entityId,
  version: result.version,
  replayed: result.replayed,
});
