import { describe, expect, it } from 'vitest';
import {
  allowedProductionAdmissionActions,
  evaluateProductionAdmission,
  type ProductionAdmissionInput,
} from '../../../../src/foundations/language/admission/admission-override.policy.ts';

const base: ProductionAdmissionInput = {
  target: 'released',
  sourceAdmissionState: 'unreleased',
  productionStatus: 'release_pending',
  admissionOverride: null,
  bagCount: null,
  selectedForShift: false,
  hasActivePlacement: false,
};

describe('production admission override policy', () => {
  it('releases an unreleased order and preserves the physical-intake boundary', () => {
    expect(evaluateProductionAdmission(base)).toEqual({
      tag: 'ok',
      value: {
        admissionOverride: 'released',
        productionStatus: 'intake_pending',
      },
    });
    expect(evaluateProductionAdmission({ ...base, bagCount: 2 })).toMatchObject(
      {
        tag: 'ok',
        value: {
          admissionOverride: 'released',
          productionStatus: 'eligible',
        },
      },
    );
  });

  it('returns a manually released order to forecast-only before commitment', () => {
    expect(
      evaluateProductionAdmission({
        ...base,
        target: 'source',
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
      }),
    ).toEqual({
      tag: 'ok',
      value: {
        admissionOverride: null,
        productionStatus: 'release_pending',
      },
    });
  });

  it.each([
    { selectedForShift: true, hasActivePlacement: false },
    { selectedForShift: false, hasActivePlacement: true },
  ])('blocks reversal after a production commitment', (commitment) => {
    expect(
      evaluateProductionAdmission({
        ...base,
        ...commitment,
        target: 'source',
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_ADMISSION_ALREADY_COMMITTED' },
    });
  });

  it('does not override source withdrawal or a real source release', () => {
    expect(
      evaluateProductionAdmission({
        ...base,
        sourceAdmissionState: 'withdrawn',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_ADMISSION_SOURCE_WITHDRAWN' },
    });
    expect(
      evaluateProductionAdmission({
        ...base,
        target: 'source',
        sourceAdmissionState: 'released',
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_ADMISSION_SOURCE_NOW_RELEASED' },
    });
  });

  it('projects only actions that are currently safe', () => {
    expect(
      allowedProductionAdmissionActions({
        sourceAdmissionState: 'unreleased',
        productionStatus: 'release_pending',
        admissionOverride: null,
        bagCount: null,
        selectedForShift: false,
        hasActivePlacement: false,
      }),
    ).toEqual(['release']);
    expect(
      allowedProductionAdmissionActions({
        sourceAdmissionState: 'unreleased',
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
        selectedForShift: true,
        hasActivePlacement: false,
      }),
    ).toEqual([]);
  });
});
