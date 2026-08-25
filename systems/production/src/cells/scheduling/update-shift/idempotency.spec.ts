import { describe, expect, it } from 'vitest';
import {
  resolveUpdateShiftReplay,
  serializeUpdateShiftWorkEventCommand,
} from './idempotency.ts';
import type { UpdateShiftWorkEventCommand } from './execute.ts';
import type { UpdateShiftResult } from './types.ts';

const command: UpdateShiftWorkEventCommand = {
  operation: 'production_shift_updated',
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_shift',
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 1,
  payload: {
    startsAt: '2026-08-22T12:30:00.000Z',
    endsAt: '2026-08-22T22:00:00.000Z',
    effectiveFolderCount: 4,
  },
};

const storedResult: UpdateShiftResult = {
  productionShift: {
    id: command.target.entityId,
    locationId: command.locationId,
    startsAt: command.payload.startsAt,
    endsAt: command.payload.endsAt,
    timezone: 'America/New_York',
    effectiveFolderCount: command.payload.effectiveFolderCount,
    status: 'open',
    version: 2,
  },
  supersededScheduleRunId: '10000000-0000-4000-8000-000000000003',
  replayed: false,
};

describe('update shift idempotency', () => {
  it('serializes the exact command identity', () => {
    expect(serializeUpdateShiftWorkEventCommand(command)).toEqual(command);
  });

  it('returns miss, exact replay with replay marker, and divergent conflict', () => {
    expect(resolveUpdateShiftReplay(null, command)).toEqual({ kind: 'miss' });
    expect(
      resolveUpdateShiftReplay(
        {
          command: serializeUpdateShiftWorkEventCommand(command),
          result: storedResult,
          valid: true,
        },
        command,
      ),
    ).toEqual({
      kind: 'replay',
      result: { ...storedResult, replayed: true },
    });
    expect(
      resolveUpdateShiftReplay(
        {
          command: serializeUpdateShiftWorkEventCommand(command),
          result: storedResult,
          valid: true,
        },
        {
          ...command,
          payload: { ...command.payload, effectiveFolderCount: 5 },
        },
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it('fails closed for malformed envelopes and results', () => {
    expect(
      resolveUpdateShiftReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveUpdateShiftReplay(
        {
          command: serializeUpdateShiftWorkEventCommand(command),
          result: {},
          valid: false,
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
