import { describe, expect, it } from 'vitest';
import {
  resolveChangeAdmissionReplay,
  serializeChangeAdmissionWorkEventCommand,
} from './idempotency.ts';

const command = {
  operation: 'production_admission_changed' as const,
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order' as const,
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 4,
  payload: { target: 'released' as const },
};

const result = {
  locationId: command.locationId,
  orderId: command.target.entityId,
  admissionOverride: 'released',
  status: 'eligible',
  version: 5,
  replayed: false,
} as const;

describe('change admission idempotency', () => {
  it('serializes the stable command identity', () => {
    expect(serializeChangeAdmissionWorkEventCommand(command)).toEqual({
      operation: 'production_admission_changed',
      locationId: command.locationId,
      actorId: command.actorId,
      target: {
        entityType: 'production_order',
        entityId: command.target.entityId,
      },
      expectedVersion: 4,
      payload: { target: 'released' },
    });
  });

  it('replays only a valid identical command and marks the result replayed', () => {
    expect(
      resolveChangeAdmissionReplay(
        {
          valid: true,
          command: serializeChangeAdmissionWorkEventCommand(command),
          result: { ...result },
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result: { ...result, replayed: true } });
    expect(resolveChangeAdmissionReplay(null, command)).toEqual({
      kind: 'miss',
    });
  });

  it.each([
    {
      name: 'different target',
      stored: {
        valid: true as const,
        command: serializeChangeAdmissionWorkEventCommand({
          ...command,
          payload: { target: 'source' as const },
        }),
        result: { ...result },
      },
    },
    {
      name: 'invalid envelope',
      stored: {
        valid: false as const,
        command: serializeChangeAdmissionWorkEventCommand(command),
        result: { ...result },
      },
    },
    {
      name: 'non-object result',
      stored: {
        valid: false as const,
        command: serializeChangeAdmissionWorkEventCommand(command),
        result: {},
      },
    },
  ])('classifies $name as a conflict', ({ stored }) => {
    expect(resolveChangeAdmissionReplay(stored, command)).toEqual({
      kind: 'conflict',
    });
  });
});
