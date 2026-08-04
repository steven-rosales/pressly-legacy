import type { LoadOperationalOrderControlContexts } from '@pressly/processor-experience';
import type { ListProductionOrderControlResult } from '@pressly/production';
import { toProcessorOrderControlContract } from './order-control.contract.mapper.ts';

export const makeProcessorOrderControlAdapter = (
  loadContexts: LoadOperationalOrderControlContexts,
) =>
  Object.freeze({
    compose: async (base: ListProductionOrderControlResult) =>
      toProcessorOrderControlContract(
        base,
        base.items.length === 0 ? new Map() : await loadContexts(base.items),
      ),
  });

export type ProcessorOrderControlAdapter = ReturnType<
  typeof makeProcessorOrderControlAdapter
>;
