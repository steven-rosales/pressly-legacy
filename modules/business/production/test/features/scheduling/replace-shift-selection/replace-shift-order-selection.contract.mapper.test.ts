import { describe, expect, it } from 'vitest';
import { toReplaceProductionShiftSelectionResult } from '../../../../src/features/scheduling/replace-shift-selection/replace-shift-order-selection.contract.mapper.ts';

describe('replace shift Order selection mapper', () => {
  it('copies the application selection into the serialized response', () => {
    const result = {
      selection: {
        productionShiftId: '11111111-1111-4111-8111-111111111111',
        version: 2,
        selectedOrderIds: ['22222222-2222-4222-8222-222222222222'],
      },
      supersededScheduleRunId: null,
      replayed: false,
    };

    const mapped = toReplaceProductionShiftSelectionResult(result);

    expect(mapped).toEqual(result);
    expect(mapped.selection.selectedOrderIds).not.toBe(
      result.selection.selectedOrderIds,
    );
  });
});
