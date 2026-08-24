import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeAdmissionCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { decideChangeAdmission } from './decide.ts';
import type { ChangeAdmissionCommand, ChangeAdmissionFacts } from './types.ts';

const command: ChangeAdmissionCommand = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  target: 'released',
  expectedVersion: 2,
  idempotencyKey: 'change-admission-command-1',
};

const facts: ChangeAdmissionFacts = {
  productionOrderId: command.productionOrderId,
  sourceAdmissionState: 'unreleased',
  productionStatus: 'release_pending',
  productionVersion: 2,
  executionStatus: 'unassigned',
  derivedWeightLbs: 25,
  admissionOverride: null,
  bagCount: 1,
  selectedForShift: false,
  hasActivePlacement: false,
  resolutionState: 'open',
};

describe('decide change admission', () => {
  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'derives the exact admitted status without effects',
        proves: ['decision'],
        run: () => {
          expect(
            decideChangeAdmission({ command, facts, policy: productionRules }),
          ).toEqual({
            kind: 'commit',
            admissionOverride: 'released',
            nextStatus: 'eligible',
          });
        },
      },
    ],
  });

  it.each([
    {
      name: 'released demand with no intake',
      command: { ...command, target: 'released' as const },
      facts: { ...facts, bagCount: null },
      decision: {
        kind: 'commit' as const,
        admissionOverride: 'released' as const,
        nextStatus: 'intake_pending' as const,
      },
    },
    {
      name: 'returning a manual release to source control',
      command: { ...command, target: 'source' as const },
      facts: {
        ...facts,
        productionStatus: 'eligible' as const,
        admissionOverride: 'released' as const,
      },
      decision: {
        kind: 'commit' as const,
        admissionOverride: null,
        nextStatus: 'release_pending' as const,
      },
    },
  ])('$name produces the exact transition mutation', (scenario) => {
    expect(
      decideChangeAdmission({
        command: scenario.command,
        facts: scenario.facts,
        policy: productionRules,
      }),
    ).toEqual(scenario.decision);
  });

  it('distinguishes missing and stale orders', () => {
    expect(
      decideChangeAdmission({ command, facts: null, policy: productionRules }),
    ).toMatchObject({
      kind: 'reject',
      failure: { kind: 'not_found', code: 'production_order_not_found' },
    });
    expect(
      decideChangeAdmission({
        command,
        facts: { ...facts, productionVersion: 3 },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_version_conflict' },
    });
  });

  it('keeps operational access and admission policy failures as typed data', () => {
    expect(
      decideChangeAdmission({
        command,
        facts: { ...facts, resolutionState: 'resolved_without_production' },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolved' },
    });
    expect(
      decideChangeAdmission({
        command,
        facts: { ...facts, sourceAdmissionState: 'withdrawn' },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_admission_source_withdrawn' },
    });
  });

  it('rejects a previously committed execution before mutation', () => {
    expect(
      decideChangeAdmission({
        command: { ...command, target: 'source' },
        facts: {
          ...facts,
          productionStatus: 'scheduled',
          executionStatus: 'scheduled',
          admissionOverride: 'released',
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_admission_already_committed' },
    });
  });

  it.each([
    {
      name: 'invalid resolution state',
      command,
      facts: { ...facts, resolutionState: 'unknown' },
      code: 'production_order_resolution_state_invalid',
      message: 'The production order resolution state is invalid.',
    },
    {
      name: 'resolved order',
      command,
      facts: { ...facts, resolutionState: 'resolved_without_production' },
      code: 'production_order_resolved',
      message: 'This order is archived from active production work.',
    },
    {
      name: 'withdrawn source',
      command,
      facts: { ...facts, sourceAdmissionState: 'withdrawn' as const },
      code: 'production_admission_source_withdrawn',
      message:
        'This order was withdrawn by its source and cannot be released to Production.',
    },
    {
      name: 'ineligible order',
      command,
      facts: { ...facts, productionStatus: 'ineligible' as const },
      code: 'production_admission_order_ineligible',
      message: 'This order is not eligible for Production admission.',
    },
    {
      name: 'source already released',
      command,
      facts: { ...facts, sourceAdmissionState: 'released' as const },
      code: 'production_admission_already_released_by_source',
      message: 'The source has already released this order to Production.',
    },
    {
      name: 'manual release already exists',
      command,
      facts: { ...facts, admissionOverride: 'released' as const },
      code: 'production_admission_already_released',
      message: 'This order has already been manually released to Production.',
    },
    {
      name: 'release from a non-forecast state',
      command,
      facts: { ...facts, productionStatus: 'intake_pending' as const },
      code: 'production_admission_release_state_invalid',
      message:
        'Only a forecast-only order can be manually released to Production.',
    },
    {
      name: 'manual release missing for reversal',
      command: { ...command, target: 'source' as const },
      facts,
      code: 'production_admission_override_not_found',
      message:
        'This order was not manually released, so there is no manual release to reverse.',
    },
    {
      name: 'source released before reversal',
      command: { ...command, target: 'source' as const },
      facts: {
        ...facts,
        sourceAdmissionState: 'released' as const,
        productionStatus: 'eligible' as const,
        admissionOverride: 'released' as const,
      },
      code: 'production_admission_source_now_released',
      message:
        'The source now considers this order production-ready, so it cannot return to forecast-only.',
    },
    {
      name: 'selected order reversal',
      command: { ...command, target: 'source' as const },
      facts: {
        ...facts,
        productionStatus: 'eligible' as const,
        admissionOverride: 'released' as const,
        selectedForShift: true,
      },
      code: 'production_admission_already_committed',
      message:
        'This order is already selected or placed for production. Remove that commitment before returning it to forecast-only.',
    },
    {
      name: 'invalid execution state',
      command,
      facts: { ...facts, executionStatus: 'unknown' },
      code: 'production_order_execution_state_invalid',
      message: 'The production order execution state is invalid.',
    },
    {
      name: 'execution already scheduled',
      command,
      facts: { ...facts, executionStatus: 'scheduled' },
      code: 'production_admission_already_committed',
      message: 'This order is already committed to production.',
    },
    {
      name: 'derived readiness state unusable',
      command,
      facts: { ...facts, derivedWeightLbs: 0 },
      code: 'production_admission_state_invalid',
      message:
        'The production admission facts do not produce a usable readiness state.',
    },
  ])('$name preserves the exact failure', (scenario) => {
    expect(
      decideChangeAdmission({
        command: scenario.command,
        facts: scenario.facts,
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'reject',
      failure: {
        kind: 'conflict',
        code: scenario.code,
        message: scenario.message,
        safeMessage: scenario.message,
      },
    });
  });
});
