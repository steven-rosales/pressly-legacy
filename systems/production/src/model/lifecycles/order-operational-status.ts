import type { ProductionOrderExecutionState } from './order-execution.ts';

export type ProductionOrderOperationalStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type ProductionOrderAdmissionFact =
  | 'unreleased'
  | 'released'
  | 'withdrawn'
  | 'post_production';

export type ProductionOrderOperationalStatusInput = Readonly<{
  executionState: ProductionOrderExecutionState;
  admission: ProductionOrderAdmissionFact;
  admissionOverride: 'released' | null;
  hasPositiveDemand: boolean;
  bagCount: number | null;
}>;

export const deriveProductionOrderOperationalStatus = (
  input: ProductionOrderOperationalStatusInput,
): ProductionOrderOperationalStatus => {
  if (input.executionState === 'finished') return 'finished';
  if (input.executionState === 'scheduled') return 'scheduled';

  if (
    !input.hasPositiveDemand ||
    input.admission === 'withdrawn' ||
    input.admission === 'post_production'
  )
    return 'ineligible';

  const admitted =
    input.admission === 'released' || input.admissionOverride === 'released';
  if (!admitted) return 'release_pending';

  const hasValidIntake =
    input.bagCount !== null &&
    Number.isInteger(input.bagCount) &&
    input.bagCount >= 0;
  return hasValidIntake ? 'eligible' : 'intake_pending';
};
