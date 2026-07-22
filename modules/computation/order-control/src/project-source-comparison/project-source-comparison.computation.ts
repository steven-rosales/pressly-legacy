import type { ProcessorOrderContext } from '@pressly/contracts';

export type SourceComparisonInput = Readonly<{
  sourceAvailable: boolean;
  commercialState: ProcessorOrderContext['commercialState'];
  admissionState: ProcessorOrderContext['admissionState'];
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
}>;

export const projectSourceComparison = (
  input: SourceComparisonInput,
): ProcessorOrderContext['comparison'] => {
  if (!input.sourceAvailable) return 'unavailable';
  if (
    input.admissionState === 'withdrawn' ||
    input.commercialState === 'canceled'
  )
    return input.productionStatus === 'finished'
      ? 'aligned'
      : 'source_withdrawn';
  if (input.commercialState === 'completed')
    return input.productionStatus === 'finished' ? 'aligned' : 'source_ahead';
  return input.productionStatus === 'finished' ? 'source_behind' : 'aligned';
};
