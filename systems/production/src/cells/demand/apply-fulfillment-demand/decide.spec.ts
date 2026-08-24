import { proveOperation } from '@pressly/testkit/operation-proof';
import { applyFulfillmentDemandCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it } from 'vitest';
import {
  decideApplyFulfillmentDemand,
  validateApplyFulfillmentDemand,
} from './decide.ts';
import type {
  ApplyFulfillmentDemandCommand,
  StoredFulfillmentDemand,
} from './types.ts';

const command = (
  overrides: Partial<ApplyFulfillmentDemandCommand> = {},
): ApplyFulfillmentDemandCommand => ({
  fulfillmentId: 'fulfillment-1',
  fulfillmentVersion: 2,
  projectionHash: 'a'.repeat(64),
  displayReference: 'ORDER-1',
  locationId: 'location-1',
  admissionState: 'unreleased',
  commercialState: 'open',
  dueAt: '2026-08-22',
  observedAt: '2026-08-22T15:00:00.000Z',
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate',
  idempotencyKey: 'order-outbox:event-1',
  ...overrides,
});

const existing = (
  overrides: Partial<StoredFulfillmentDemand> = {},
): StoredFulfillmentDemand => ({
  orderDemandId: 'demand-1',
  productionOrderId: 'order-1',
  fulfillmentId: 'fulfillment-1',
  fulfillmentVersion: 1,
  projectionHash: 'b'.repeat(64),
  locationId: 'location-1',
  admissionState: 'unreleased',
  commercialState: 'open',
  dueAt: '2026-08-21T20:00:00.000Z',
  estimatedWeightLbs: 20,
  estimatedWeightSource: 'external_estimate',
  bagCount: null,
  admissionOverride: null,
  productionExecutionStatus: 'unassigned',
  productionResolutionState: 'open',
  productionStatus: 'release_pending',
  ...overrides,
});

describe('apply fulfillment demand decision', () => {
  it.each([
    [{ fulfillmentVersion: 0 }, 'fulfillment_demand_invalid'],
    [{ fulfillmentVersion: 1.5 }, 'fulfillment_demand_invalid'],
    [{ projectionHash: 'A'.repeat(64) }, 'fulfillment_demand_invalid'],
    [{ dueAt: 'not-a-date' }, 'fulfillment_demand_invalid'],
    [{ observedAt: 'not-a-date' }, 'fulfillment_demand_invalid'],
    [{ estimatedWeightLbs: 0 }, 'fulfillment_demand_weight_invalid'],
    [
      { estimatedWeightLbs: null, estimatedWeightSource: 'external_estimate' },
      'fulfillment_demand_weight_invalid',
    ],
  ] as const)('retains semantic validation for %o', (overrides, code) => {
    expect(validateApplyFulfillmentDemand(command(overrides))).toMatchObject({
      kind: 'validation',
      classification: 'semantic',
      code,
    });
  });

  it('retains loose Date.parse acceptance', () => {
    expect(
      validateApplyFulfillmentDemand(command({ dueAt: '2026-08-22' })),
    ).toBeNull();
  });

  it.each([
    {
      name: 'location drift',
      current: existing({ locationId: 'location-2' }),
      incoming: command(),
      expected: {
        kind: 'reject',
        failure: { code: 'fulfillment_location_changed' },
      },
    },
    {
      name: 'older revision',
      current: existing({ fulfillmentVersion: 3 }),
      incoming: command({ fulfillmentVersion: 2 }),
      expected: { kind: 'audit', outcome: 'ignored_older' },
    },
    {
      name: 'same-version divergence',
      current: existing({
        fulfillmentVersion: 2,
        projectionHash: 'b'.repeat(64),
      }),
      incoming: command({
        fulfillmentVersion: 2,
        projectionHash: 'c'.repeat(64),
      }),
      expected: {
        kind: 'reject',
        failure: { code: 'fulfillment_demand_diverged' },
      },
    },
    {
      name: 'same-version equality',
      current: existing({
        fulfillmentVersion: 2,
        projectionHash: 'a'.repeat(64),
      }),
      incoming: command(),
      expected: { kind: 'audit', outcome: 'unchanged' },
    },
  ])(
    'decides $name before lifecycle mutation',
    ({ current, incoming, expected }) => {
      expect(
        decideApplyFulfillmentDemand({
          command: incoming,
          existing: current,
          policy: productionRules,
        }),
      ).toMatchObject(expected);
    },
  );

  it.each([
    {
      name: 'unweighed demand only',
      incoming: command({
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      }),
      current: null,
      expected: { production: { action: 'none' } },
    },
    {
      name: 'unreleased work',
      incoming: command(),
      current: null,
      expected: {
        production: { action: 'create', status: 'release_pending' },
      },
    },
    {
      name: 'released work awaits physical intake',
      incoming: command({ admissionState: 'released' }),
      current: null,
      expected: {
        production: { action: 'create', status: 'intake_pending' },
      },
    },
    {
      name: 'physical intake makes released work eligible',
      incoming: command({ admissionState: 'released' }),
      current: existing({ bagCount: 2 }),
      expected: {
        production: { action: 'update', status: 'eligible' },
      },
    },
    {
      name: 'manual release survives lagging unreleased source',
      incoming: command({ admissionState: 'unreleased' }),
      current: existing({ bagCount: 2, admissionOverride: 'released' }),
      expected: {
        production: { action: 'update', status: 'eligible' },
      },
    },
    {
      name: 'withdrawal makes unfinished work ineligible',
      incoming: command({ admissionState: 'withdrawn' }),
      current: existing({ bagCount: 2, admissionOverride: 'released' }),
      expected: {
        production: { action: 'update', status: 'ineligible' },
      },
    },
    {
      name: 'scheduled work is preserved',
      incoming: command({ admissionState: 'withdrawn' }),
      current: existing({
        productionExecutionStatus: 'scheduled',
        productionStatus: 'scheduled',
      }),
      expected: { production: { action: 'preserve' } },
    },
    {
      name: 'resolved work is preserved',
      incoming: command({ admissionState: 'released' }),
      current: existing({
        productionResolutionState: 'resolved_without_production',
      }),
      expected: { production: { action: 'preserve' } },
    },
  ])('decides $name', ({ incoming, current, expected }) => {
    expect(
      decideApplyFulfillmentDemand({
        command: incoming,
        existing: current,
        policy: productionRules,
      }),
    ).toMatchObject({ kind: 'apply', ...expected });
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the exact execution-state conflict instead of throwing',
        proves: ['decision'],
        run: () => {
          expect(
            decideApplyFulfillmentDemand({
              command: command(),
              existing: existing({ productionExecutionStatus: 'corrupt' }),
              policy: productionRules,
            }),
          ).toMatchObject({
            kind: 'reject',
            failure: { code: 'production_order_execution_state_invalid' },
          });
        },
      },
    ],
  });
});
