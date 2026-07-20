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

export type DemandReconciliationStatus =
  | 'none'
  | 'source_ahead'
  | 'source_withdrawn'
  | 'source_behind';

export type DemandLifecycleInput = Readonly<{
  phase: OrderDemandPhase;
  productionStatus: DemandProductionStatus | null;
  currentBagCount: number | null;
  incomingBagCount: number | null;
  estimatedWeightLbs: number | null;
}>;

export type DemandLifecycleDecision = Readonly<{
  effectiveBagCount: number | null;
  reconciliation: DemandReconciliationStatus;
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

export const evaluateDemandReconciliation = (
  input: Pick<
    DemandLifecycleInput,
    'phase' | 'productionStatus' | 'currentBagCount'
  >,
): DemandReconciliationStatus => {
  if (
    input.phase === 'post_production' &&
    input.productionStatus !== 'finished'
  )
    return 'source_ahead';

  if (
    input.phase === 'withdrawn' &&
    input.currentBagCount !== null &&
    input.productionStatus !== 'finished'
  )
    return 'source_withdrawn';

  if (input.productionStatus === 'finished' && isActiveDemand(input.phase))
    return 'source_behind';

  return 'none';
};

export const evaluateDemandLifecycle = (
  input: DemandLifecycleInput,
): DemandLifecycleDecision => {
  const effectiveBagCount = input.currentBagCount ?? input.incomingBagCount;
  const reconciliation = evaluateDemandReconciliation(input);

  if (
    input.productionStatus === 'scheduled' ||
    input.productionStatus === 'finished'
  )
    return {
      effectiveBagCount,
      reconciliation,
      production: { action: 'preserve' },
    };

  if (!isActiveDemand(input.phase)) {
    if (input.productionStatus === null)
      return {
        effectiveBagCount,
        reconciliation,
        production: { action: 'none' },
      };

    return {
      effectiveBagCount,
      reconciliation,
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
      reconciliation,
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
    reconciliation,
    production: {
      action: input.productionStatus === null ? 'create' : 'update',
      status,
    },
  };
};
