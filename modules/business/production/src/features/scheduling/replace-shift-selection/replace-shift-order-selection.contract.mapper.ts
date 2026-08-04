export {
  productionShiftParamsSchema,
  replaceProductionShiftSelectionRequestSchema,
  replaceProductionShiftSelectionResultSchema,
} from '@pressly/contracts/production';
import type { ReplaceProductionShiftSelectionResult as ReplaceProductionShiftSelectionWireResult } from '@pressly/contracts/production';
import type { ReplaceShiftOrderSelectionResult } from './replace-shift-order-selection.model.ts';

export const toReplaceProductionShiftSelectionResult = (
  result: ReplaceShiftOrderSelectionResult,
): ReplaceProductionShiftSelectionWireResult => ({
  selection: {
    productionShiftId: result.selection.productionShiftId,
    version: result.selection.version,
    selectedOrderIds: [...result.selection.selectedOrderIds],
  },
  supersededScheduleRunId: result.supersededScheduleRunId,
  replayed: result.replayed,
});
