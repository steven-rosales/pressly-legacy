export type OrderDemandPhase =
  | 'expected'
  | 'inbound'
  | 'production_released'
  | 'post_production'
  | 'withdrawn';

export type DemandProductionStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type DemandLifecycleInput = Readonly<{
  phase: OrderDemandPhase;
  productionStatus: DemandProductionStatus | null;
  currentBagCount: number | null;
  incomingBagCount: number | null;
  estimatedWeightLbs: number | null;
}>;

export type DemandLifecycleDecision = Readonly<{
  effectiveBagCount: number | null;
  production:
    | Readonly<{ action: 'none' }>
    | Readonly<{ action: 'preserve' }>
    | Readonly<{
        action: 'create' | 'update';
        status:
          | 'release_pending'
          | 'intake_pending'
          | 'eligible'
          | 'ineligible';
      }>;
}>;

const isActiveDemand = (phase: OrderDemandPhase): boolean =>
  phase === 'expected' ||
  phase === 'inbound' ||
  phase === 'production_released';

export const evaluateDemandLifecycle = (
  input: DemandLifecycleInput,
): DemandLifecycleDecision => {
  const effectiveBagCount = input.currentBagCount ?? input.incomingBagCount;

  if (
    input.productionStatus === 'scheduled' ||
    input.productionStatus === 'finished'
  )
    return {
      effectiveBagCount,
      production: { action: 'preserve' },
    };

  if (!isActiveDemand(input.phase)) {
    if (input.productionStatus === null)
      return {
        effectiveBagCount,
        production: { action: 'none' },
      };

    return {
      effectiveBagCount,
      production: { action: 'update', status: 'ineligible' },
    };
  }

  const hasEstimate =
    input.estimatedWeightLbs !== null &&
    Number.isFinite(input.estimatedWeightLbs) &&
    input.estimatedWeightLbs > 0;

  if (!hasEstimate)
    return {
      effectiveBagCount,
      production:
        input.productionStatus === null
          ? { action: 'none' }
          : { action: 'update', status: 'ineligible' },
    };

  const hasValidIntake =
    effectiveBagCount !== null &&
    Number.isInteger(effectiveBagCount) &&
    effectiveBagCount >= 0;
  const status =
    input.phase === 'production_released'
      ? hasValidIntake
        ? ('eligible' as const)
        : ('intake_pending' as const)
      : ('release_pending' as const);

  return {
    effectiveBagCount,
    production: {
      action: input.productionStatus === null ? 'create' : 'update',
      status,
    },
  };
};
