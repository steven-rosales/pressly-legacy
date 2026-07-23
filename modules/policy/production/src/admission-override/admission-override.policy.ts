export type ProductionAdmissionTarget = 'released' | 'source';

export type ProductionAdmissionOverride = 'released' | null;

export type ProductionAdmissionAction = 'release' | 'return_to_source';

export type ProductionAdmissionStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type ProductionAdmissionInput = Readonly<{
  target: ProductionAdmissionTarget;
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  productionStatus: ProductionAdmissionStatus;
  admissionOverride: ProductionAdmissionOverride;
  bagCount: number | null;
  selectedForShift: boolean;
  hasActivePlacement: boolean;
}>;

export type ProductionAdmissionDecision =
  | Readonly<{
      tag: 'ok';
      value: Readonly<{
        admissionOverride: ProductionAdmissionOverride;
        productionStatus: 'release_pending' | 'intake_pending' | 'eligible';
      }>;
    }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{ code: string; message: string }>;
    }>;

const rejected = (
  code: string,
  message: string,
): ProductionAdmissionDecision => ({
  tag: 'err',
  error: { code, message },
});

const isCommitted = (input: ProductionAdmissionInput): boolean =>
  input.selectedForShift ||
  input.hasActivePlacement ||
  input.productionStatus === 'scheduled' ||
  input.productionStatus === 'finished';

export const evaluateProductionAdmission = (
  input: ProductionAdmissionInput,
): ProductionAdmissionDecision => {
  if (input.sourceAdmissionState === 'withdrawn')
    return rejected(
      'PRODUCTION_ADMISSION_SOURCE_WITHDRAWN',
      'This order was withdrawn by its source and cannot be released to Production.',
    );

  if (input.productionStatus === 'ineligible')
    return rejected(
      'PRODUCTION_ADMISSION_ORDER_INELIGIBLE',
      'This order is not eligible for Production admission.',
    );

  if (input.target === 'released') {
    if (input.sourceAdmissionState === 'released')
      return rejected(
        'PRODUCTION_ADMISSION_ALREADY_RELEASED_BY_SOURCE',
        'The source has already released this order to Production.',
      );

    if (input.admissionOverride === 'released')
      return rejected(
        'PRODUCTION_ADMISSION_ALREADY_RELEASED',
        'This order has already been manually released to Production.',
      );

    if (input.productionStatus !== 'release_pending')
      return rejected(
        'PRODUCTION_ADMISSION_RELEASE_STATE_INVALID',
        'Only a forecast-only order can be manually released to Production.',
      );

    const hasValidIntake =
      input.bagCount !== null &&
      Number.isInteger(input.bagCount) &&
      input.bagCount >= 0;
    return {
      tag: 'ok',
      value: {
        admissionOverride: 'released',
        productionStatus: hasValidIntake ? 'eligible' : 'intake_pending',
      },
    };
  }

  if (input.admissionOverride !== 'released')
    return rejected(
      'PRODUCTION_ADMISSION_OVERRIDE_NOT_FOUND',
      'This order was not manually released, so there is no manual release to reverse.',
    );

  if (input.sourceAdmissionState === 'released')
    return rejected(
      'PRODUCTION_ADMISSION_SOURCE_NOW_RELEASED',
      'The source now considers this order production-ready, so it cannot return to forecast-only.',
    );

  if (isCommitted(input))
    return rejected(
      'PRODUCTION_ADMISSION_ALREADY_COMMITTED',
      'This order is already selected or placed for production. Remove that commitment before returning it to forecast-only.',
    );

  return {
    tag: 'ok',
    value: {
      admissionOverride: null,
      productionStatus: 'release_pending',
    },
  };
};

export const allowedProductionAdmissionActions = (
  input: Omit<ProductionAdmissionInput, 'target'>,
): readonly ProductionAdmissionAction[] => {
  const actions: ProductionAdmissionAction[] = [];
  if (
    evaluateProductionAdmission({ ...input, target: 'released' }).tag === 'ok'
  )
    actions.push('release');
  if (evaluateProductionAdmission({ ...input, target: 'source' }).tag === 'ok')
    actions.push('return_to_source');
  return actions;
};
