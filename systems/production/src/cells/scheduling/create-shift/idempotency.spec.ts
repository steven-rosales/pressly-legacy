import { describe, expect, it } from 'vitest';
import {
  resolveCreateShiftReplay,
  serializeCreateShiftWorkEventCommand,
} from './idempotency.ts';
import type { ProductionShift } from './types.ts';

const command = {
  operation: 'production_shift_created' as const,
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: { entityType: 'production_shift' as const, entityId: null },
  expectedVersion: null,
  payload: {
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 4,
  },
};

const result: ProductionShift = {
  id: '10000000-0000-4000-8000-000000000002',
  locationId: 'location-1',
  startsAt: command.payload.startsAt,
  endsAt: command.payload.endsAt,
  timezone: command.payload.timezone,
  effectiveFolderCount: command.payload.effectiveFolderCount,
  status: 'open',
  version: 1,
};

describe('create shift idempotency', () => {
  it('serializes the stable command identity including null target/version', () => {
    expect(serializeCreateShiftWorkEventCommand(command)).toEqual({
      ...command,
      target: { entityType: 'production_shift', entityId: null },
      expectedVersion: null,
      payload: command.payload,
    });
  });

  it('replays only an exact valid canonical command', () => {
    expect(
      resolveCreateShiftReplay(
        {
          command: serializeCreateShiftWorkEventCommand(command),
          result,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result });
    expect(
      resolveCreateShiftReplay(
        {
          command: {
            ...serializeCreateShiftWorkEventCommand(command),
            actorId: 'another-actor',
          },
          result,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
