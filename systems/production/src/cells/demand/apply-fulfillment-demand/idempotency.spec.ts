import { describe, expect, it } from 'vitest';
import {
  resolveApplyFulfillmentDemandReplay,
  serializeApplyFulfillmentDemandWorkEventCommand,
} from './idempotency.ts';
import { applyFulfillmentDemandWorkEventCommand } from './execute.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandResult,
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
  dueAt: '2026-08-22T20:00:00.000Z',
  observedAt: '2026-08-22T15:00:00.000Z',
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate',
  idempotencyKey: 'order-outbox:event-1',
  ...overrides,
});

describe('apply fulfillment demand idempotency', () => {
  it('serializes the exact system actor, null target/version, and mapped source payload', () => {
    expect(
      serializeApplyFulfillmentDemandWorkEventCommand(
        applyFulfillmentDemandWorkEventCommand(command()),
      ),
    ).toEqual({
      operation: 'fulfillment_demand_applied',
      locationId: 'location-1',
      actorId: '00000000-0000-4000-8000-000000000000',
      target: { entityType: 'order_demand', entityId: null },
      expectedVersion: null,
      payload: {
        fulfillmentId: 'fulfillment-1',
        fulfillmentVersion: 2,
        projectionHash: 'a'.repeat(64),
        displayReference: 'ORDER-1',
        admissionState: 'unreleased',
        commercialState: 'open',
        dueAt: '2026-08-22T20:00:00.000Z',
        observedAt: '2026-08-22T15:00:00.000Z',
        estimatedWeightLbs: 24,
        estimatedWeightSource: 'external_estimate',
      },
    });
  });

  it('replays only the exact command and marks ordinary stored results replayed', () => {
    const expected = applyFulfillmentDemandWorkEventCommand(command());
    const result: ApplyFulfillmentDemandResult = {
      orderDemandId: 'demand-1',
      productionOrderId: 'order-1',
      outcome: 'applied',
      replayed: false,
    };
    expect(
      resolveApplyFulfillmentDemandReplay(
        {
          valid: true,
          command: serializeApplyFulfillmentDemandWorkEventCommand(expected),
          result,
        },
        expected,
      ),
    ).toEqual({ kind: 'replay', result: { ...result, replayed: true } });
    expect(
      resolveApplyFulfillmentDemandReplay(
        {
          valid: true,
          command: serializeApplyFulfillmentDemandWorkEventCommand(expected),
          result,
        },
        applyFulfillmentDemandWorkEventCommand(
          command({ displayReference: 'changed' }),
        ),
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it('keeps malformed stored envelopes on the conflict rail', () => {
    const expected = applyFulfillmentDemandWorkEventCommand(command());
    expect(
      resolveApplyFulfillmentDemandReplay(
        { valid: false, command: {}, result: {} },
        expected,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveApplyFulfillmentDemandReplay(
        {
          valid: false,
          command: serializeApplyFulfillmentDemandWorkEventCommand(expected),
          result: {},
        },
        expected,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
