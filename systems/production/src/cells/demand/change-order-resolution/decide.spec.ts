import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeOrderResolutionCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { decideChangeOrderResolution } from './decide.ts';
import type {
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionFacts,
} from './types.ts';

const ids = {
  order: '10000000-0000-4000-8000-000000000001',
  actor: '10000000-0000-4000-8000-000000000002',
};
const resolveCommand: ChangeOrderResolutionCommand = {
  locationId: 'location-1',
  productionOrderId: ids.order,
  actorId: ids.actor,
  action: 'resolve_without_production',
  reason: 'processor_not_in_use',
  note: null,
  confirmReviewedFacts: false,
  expectedVersion: 4,
  idempotencyKey: 'resolve-order-command-1',
};
const restoreCommand: ChangeOrderResolutionCommand = {
  locationId: 'location-1',
  productionOrderId: ids.order,
  actorId: ids.actor,
  action: 'restore',
  reason: 'work_should_be_produced',
  note: null,
  expectedVersion: 4,
  idempotencyKey: 'restore-order-command-1',
};
const facts = (
  overrides: Partial<ChangeOrderResolutionFacts> = {},
): ChangeOrderResolutionFacts => ({
  productionOrderId: ids.order,
  productionVersion: 4,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  demandPhase: 'expected',
  sourceDueAt: new Date('2026-08-22T20:00:00.000Z'),
  sourceEstimatedWeightLbs: 24,
  sourceEstimatedWeightSource: 'external_estimate',
  admissionOverride: null,
  bagCount: null,
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasHistoricalPlanSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
  ...overrides,
});

describe('decide change order resolution', () => {
  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'resolves clean unassigned work through the resolution graph',
        proves: ['decision'],
        run: () => {
          expect(
            decideChangeOrderResolution({
              command: resolveCommand,
              facts: facts(),
              policy: productionRules,
            }),
          ).toEqual({
            kind: 'commit',
            lifecycle: { from: 'open', state: 'resolved_without_production' },
            clearPendingPlacement: false,
            reviewReasons: [],
            restoredSourceProjection: null,
          });
        },
      },
    ],
  });

  it('distinguishes missing, stale, and source-precondition conflicts', () => {
    expect(
      decideChangeOrderResolution({
        command: resolveCommand,
        facts: null,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { kind: 'not_found', code: 'production_order_not_found' },
    });
    expect(
      decideChangeOrderResolution({
        command: resolveCommand,
        facts: facts({ productionVersion: 5 }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_version_conflict' },
    });
    expect(
      decideChangeOrderResolution({
        command: {
          ...resolveCommand,
          sourceStatePrecondition: {
            commercialState: 'open',
            admissionState: 'unreleased',
          },
        },
        facts: facts({ sourceAdmissionState: 'released' }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_source_state_conflict' },
    });
  });

  it('requires review and clears only the pending placement after confirmation', () => {
    const reviewed = facts({
      hasIntake: true,
      hasManualAdmission: true,
      isPriority: true,
      hasPendingPlacement: true,
    });
    expect(
      decideChangeOrderResolution({
        command: resolveCommand,
        facts: reviewed,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolution_review_required' },
    });
    expect(
      decideChangeOrderResolution({
        command: { ...resolveCommand, confirmReviewedFacts: true },
        facts: reviewed,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'commit',
      clearPendingPlacement: true,
      reviewReasons: [
        'intake_recorded',
        'manual_admission',
        'priority',
        'pending_placement',
      ],
    });
  });

  it.each([
    {
      name: 'scheduled execution',
      values: { executionStatus: 'scheduled' as const },
    },
    {
      name: 'finished execution',
      values: { executionStatus: 'finished' as const },
    },
    {
      name: 'scheduled operational fallback',
      values: { operationalStatus: 'scheduled' as const },
    },
    {
      name: 'finished operational fallback',
      values: { operationalStatus: 'finished' as const },
    },
    { name: 'current selection', values: { hasShiftSelection: true } },
    {
      name: 'historical selection',
      values: { hasHistoricalPlanSelection: true },
    },
    { name: 'batch membership', values: { hasBatchMembership: true } },
    { name: 'stage attempt', values: { hasStageAttempt: true } },
    { name: 'route history', values: { hasRoute: true } },
  ])('blocks resolution after $name', ({ values }) => {
    expect(
      decideChangeOrderResolution({
        command: { ...resolveCommand, confirmReviewedFacts: true },
        facts: facts(values),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolution_blocked' },
    });
  });

  it('restores current released demand and clears the stale override', () => {
    expect(
      decideChangeOrderResolution({
        command: restoreCommand,
        facts: facts({
          resolutionState: 'resolved_without_production',
          sourceAdmissionState: 'released',
          demandPhase: 'production_released',
          bagCount: 2,
          admissionOverride: 'released',
        }),
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'commit',
      lifecycle: { from: 'resolved_without_production', state: 'open' },
      clearPendingPlacement: false,
      reviewReasons: [],
      restoredSourceProjection: {
        dueAt: new Date('2026-08-22T20:00:00.000Z'),
        derivedWeightLbs: 24,
        derivedWeightSource: 'external_estimate',
        operationalStatus: 'eligible',
        clearAdmissionOverride: true,
      },
    });
  });

  it.each([
    {
      name: 'unreleased without intake',
      values: {},
      status: 'release_pending',
      clearAdmissionOverride: false,
    },
    {
      name: 'released without intake',
      values: {
        sourceAdmissionState: 'released' as const,
        demandPhase: 'production_released' as const,
      },
      status: 'intake_pending',
      clearAdmissionOverride: true,
    },
    {
      name: 'closed commercial source',
      values: {
        sourceCommercialState: 'completed' as const,
        sourceAdmissionState: 'released' as const,
        demandPhase: 'production_released' as const,
        bagCount: 2,
      },
      status: 'ineligible',
      clearAdmissionOverride: true,
    },
  ])(
    'derives $name as $status',
    ({ values, status, clearAdmissionOverride }) => {
      const decision = decideChangeOrderResolution({
        command: restoreCommand,
        facts: facts({
          resolutionState: 'resolved_without_production',
          ...values,
        }),
        policy: productionRules,
      });
      expect(decision).toMatchObject({
        kind: 'commit',
        restoredSourceProjection: {
          operationalStatus: status,
          clearAdmissionOverride,
        },
      });
    },
  );

  it.each([
    {
      name: 'missing weight',
      values: { sourceEstimatedWeightLbs: null },
    },
    { name: 'nonpositive weight', values: { sourceEstimatedWeightLbs: 0 } },
    {
      name: 'missing provenance',
      values: { sourceEstimatedWeightSource: null },
    },
  ])('rejects restore with $name', ({ values }) => {
    expect(
      decideChangeOrderResolution({
        command: restoreCommand,
        facts: facts({
          resolutionState: 'resolved_without_production',
          ...values,
        }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_restore_demand_invalid' },
    });
  });

  it('rejects wrong graph events and committed restoration', () => {
    expect(
      decideChangeOrderResolution({
        command: resolveCommand,
        facts: facts({ resolutionState: 'resolved_without_production' }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolution_event_not_allowed' },
    });
    expect(
      decideChangeOrderResolution({
        command: restoreCommand,
        facts: facts({
          resolutionState: 'resolved_without_production',
          executionStatus: 'scheduled',
        }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_restore_blocked' },
    });
  });

  it.each([
    {
      name: 'unknown resolution state',
      values: { resolutionState: 'corrupt' },
      code: 'production_order_resolution_state_invalid',
    },
    {
      name: 'unknown execution state',
      values: { executionStatus: 'corrupt' },
      code: 'production_order_execution_state_invalid',
    },
  ])('rejects $name through the owning policy', ({ values, code }) => {
    expect(
      decideChangeOrderResolution({
        command: resolveCommand,
        facts: facts(values),
        policy: productionRules,
      }),
    ).toMatchObject({ kind: 'reject', failure: { code } });
  });
});
