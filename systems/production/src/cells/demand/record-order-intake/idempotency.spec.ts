import { describe, expect, it } from 'vitest';
import {
  resolveRecordOrderIntakeReplay,
  serializeRecordOrderIntakeWorkEventCommand,
} from './idempotency.ts';

const command = {
  operation: 'production_order_intake_recorded' as const,
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order' as const,
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 4,
  payload: { bagCount: 3 },
};

const storedResult = {
  locationId: command.locationId,
  orderId: command.target.entityId,
  bagCount: 3,
  bagCountProvenance: 'operator_intake',
  intakeVersion: 2,
  version: 5,
  replayed: false,
} as const;

describe('record order intake idempotency', () => {
  it('serializes the stable command identity', () => {
    expect(serializeRecordOrderIntakeWorkEventCommand(command)).toEqual({
      operation: 'production_order_intake_recorded',
      locationId: command.locationId,
      actorId: command.actorId,
      target: {
        entityType: 'production_order',
        entityId: command.target.entityId,
      },
      expectedVersion: 4,
      payload: { bagCount: 3 },
    });
  });

  it('replays only one valid identical receipt and marks it replayed', () => {
    expect(
      resolveRecordOrderIntakeReplay(
        {
          valid: true,
          command: serializeRecordOrderIntakeWorkEventCommand(command),
          result: { ...storedResult },
        },
        command,
      ),
    ).toEqual({
      kind: 'replay',
      result: { ...storedResult, replayed: true },
    });
    expect(resolveRecordOrderIntakeReplay(null, command)).toEqual({
      kind: 'miss',
    });
  });

  it.each([
    {
      name: 'different bag count',
      stored: {
        valid: true as const,
        command: serializeRecordOrderIntakeWorkEventCommand({
          ...command,
          payload: { bagCount: 2 },
        }),
        result: { ...storedResult },
      },
    },
    {
      name: 'invalid envelope',
      stored: {
        valid: false as const,
        command: serializeRecordOrderIntakeWorkEventCommand(command),
        result: { ...storedResult },
      },
    },
    {
      name: 'non-object result',
      stored: {
        valid: false as const,
        command: serializeRecordOrderIntakeWorkEventCommand(command),
        result: {},
      },
    },
  ])('classifies $name as divergent reuse', ({ stored }) => {
    expect(resolveRecordOrderIntakeReplay(stored, command)).toEqual({
      kind: 'conflict',
    });
  });
});
