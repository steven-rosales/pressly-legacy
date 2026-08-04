import type {
  ProcessorOperationalOrderIdentity,
  ProcessorProductionOrderBacklogPreview,
} from '@pressly/contracts/processor';
import { productionOrderBacklogCursorSchema } from '@pressly/contracts/production';
import { productionOrderReferenceId } from '@pressly/processor-experience';
import type { ProductionOrderBacklogPreview } from '@pressly/production';
import { requireOperationalOrderIdentity } from './operational-order-identity.contract.mapper.ts';

export const toProcessorProductionOrderBacklogContract = (
  base: ProductionOrderBacklogPreview,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorProductionOrderBacklogPreview => {
  const identify = (
    item: ProductionOrderBacklogPreview['groups']['readyToArchive'][number],
  ) => ({
    ...item,
    reasons: [...item.reasons],
    identity: requireOperationalOrderIdentity(
      identities,
      productionOrderReferenceId(item.orderId),
    ),
  });

  return {
    ...base,
    cursor:
      base.cursor === null
        ? null
        : productionOrderBacklogCursorSchema.parse(base.cursor),
    nextCursor:
      base.nextCursor === null
        ? null
        : productionOrderBacklogCursorSchema.parse(base.nextCursor),
    groups: {
      readyToArchive: base.groups.readyToArchive.map(identify),
      reviewIndividually: base.groups.reviewIndividually.map(identify),
      keptForSafety: base.groups.keptForSafety.map(identify),
      alreadyHistorical: base.groups.alreadyHistorical.map(identify),
    },
  };
};
