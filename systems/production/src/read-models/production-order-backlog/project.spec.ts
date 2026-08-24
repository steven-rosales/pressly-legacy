import { describe, expect, it } from 'vitest';
import { productionRules } from '../../model/public.ts';
import {
  classifyProductionOrderBacklogSnapshot,
  hashProductionOrderBacklogPreview,
} from './project.ts';
import type {
  ProductionOrderBacklogPolicy,
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshotOrder,
} from './model.ts';

const uuid = (suffix: number): string =>
  `72000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const scope: ProductionOrderBacklogScope = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 7,
};

const order = (
  suffix: number,
  overrides: Partial<ProductionOrderBacklogSnapshotOrder> = {},
): ProductionOrderBacklogSnapshotOrder => ({
  orderId: uuid(suffix),
  locationId: scope.locationId,
  displayReference: `ORDER-${suffix}`,
  dueAt: new Date(`2026-07-${String(suffix).padStart(2, '0')}T12:00:00.000Z`),
  productionVersion: suffix,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
  ...overrides,
});

describe('Production order backlog read model', () => {
  it('classifies every lifecycle and guard branch from complete safety evidence', () => {
    const classified = classifyProductionOrderBacklogSnapshot(productionRules, {
      hasMore: true,
      orders: [
        order(1),
        order(2, {
          hasIntake: true,
          hasManualAdmission: true,
          isPriority: true,
          hasPendingPlacement: true,
        }),
        order(3, {
          executionStatus: 'scheduled',
          operationalStatus: 'scheduled',
          hasShiftSelection: true,
          hasBatchMembership: true,
          hasStageAttempt: true,
          hasRoute: true,
        }),
        order(4, { resolutionState: 'resolved_without_production' }),
        order(5, {
          executionStatus: 'finished',
          operationalStatus: 'finished',
        }),
        order(6, { executionStatus: 'not-a-state' }),
      ],
    });

    expect(classified.orders.map(({ item }) => item)).toEqual([
      expect.objectContaining({
        orderId: uuid(1),
        category: 'ready_to_archive',
        reasons: ['no_operator_owned_facts'],
      }),
      expect.objectContaining({
        orderId: uuid(2),
        category: 'review_individually',
        reasons: [
          'intake_recorded',
          'manual_admission',
          'priority',
          'pending_placement',
        ],
      }),
      expect.objectContaining({
        orderId: uuid(3),
        category: 'kept_for_safety',
        reasons: [
          'execution_committed',
          'selected_for_shift',
          'batch_membership_exists',
          'stage_attempt_exists',
          'route_exists',
        ],
      }),
      expect.objectContaining({
        orderId: uuid(4),
        category: 'already_historical',
        reasons: ['resolved_without_production'],
      }),
      expect.objectContaining({
        orderId: uuid(5),
        category: 'already_historical',
        reasons: ['execution_finished'],
      }),
      expect.objectContaining({
        orderId: uuid(6),
        category: 'kept_for_safety',
        reasons: ['execution_state_invalid'],
      }),
    ]);
    expect(classified.orders[0]?.lifecycle).toMatchObject({
      from: 'open',
      state: 'resolved_without_production',
    });
  });

  it('keeps a rejected resolution transition in safety review', () => {
    const policy: ProductionOrderBacklogPolicy = {
      ...productionRules,
      evaluateProductionOrderResolutionTransition: () => ({
        tag: 'err',
        error: {
          code: 'PRODUCTION_ORDER_RESOLUTION_EVENT_NOT_ALLOWED',
          message: 'The production order resolution event is not allowed.',
        },
      }),
    };
    const classified = classifyProductionOrderBacklogSnapshot(policy, {
      hasMore: false,
      orders: [order(1)],
    });
    expect(classified.orders[0]?.item).toMatchObject({
      category: 'kept_for_safety',
      reasons: ['resolution_transition_invalid'],
    });
  });

  it('hashes the complete canonical version-2 snapshot by order ID', () => {
    const left = classifyProductionOrderBacklogSnapshot(productionRules, {
      hasMore: false,
      orders: [order(2, { hasIntake: true }), order(1)],
    });
    const right = classifyProductionOrderBacklogSnapshot(productionRules, {
      hasMore: false,
      orders: [order(1), order(2, { hasIntake: true })],
    });

    expect(hashProductionOrderBacklogPreview(scope, left)).toBe(
      hashProductionOrderBacklogPreview(scope, right),
    );
    expect(hashProductionOrderBacklogPreview(scope, left)).toBe(
      '92b1c56ae10dd36c1ee7d565b3b6d33c36b69c567af1cdf0d6168c2f7f3509bb',
    );
    expect(
      hashProductionOrderBacklogPreview(
        { ...scope, reason: 'duplicate_or_test' },
        left,
      ),
    ).not.toBe(hashProductionOrderBacklogPreview(scope, left));
    expect(
      hashProductionOrderBacklogPreview(scope, { ...left, hasMore: true }),
    ).not.toBe(hashProductionOrderBacklogPreview(scope, left));
  });
});
