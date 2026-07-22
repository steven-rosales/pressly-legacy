import { describe, expect, it } from 'vitest';
import { projectSourceComparison } from '../../src/project-source-comparison/project-source-comparison.computation.ts';

describe('Order Control source comparison projection', () => {
  it('reports unavailable when no source observation exists', () => {
    expect(
      projectSourceComparison({
        sourceAvailable: false,
        commercialState: 'open',
        admissionState: 'released',
        productionStatus: 'scheduled',
      }),
    ).toBe('unavailable');
  });

  it('projects source-ahead, source-behind, and withdrawn disagreements', () => {
    expect(
      projectSourceComparison({
        sourceAvailable: true,
        commercialState: 'completed',
        admissionState: 'released',
        productionStatus: 'scheduled',
      }),
    ).toBe('source_ahead');
    expect(
      projectSourceComparison({
        sourceAvailable: true,
        commercialState: 'open',
        admissionState: 'released',
        productionStatus: 'finished',
      }),
    ).toBe('source_behind');
    expect(
      projectSourceComparison({
        sourceAvailable: true,
        commercialState: 'canceled',
        admissionState: 'withdrawn',
        productionStatus: 'eligible',
      }),
    ).toBe('source_withdrawn');
  });
});
