import { proveOperation } from '@pressly/testkit/operation-proof';
import { createShiftCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { createShiftContract } from './contract.ts';

const actorId = '10000000-0000-4000-8000-000000000001';
const shiftId = '10000000-0000-4000-8000-000000000002';

describe('create shift contract', () => {
  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes the strict deployed request plus trusted actor context',
        proves: ['contract'],
        run: () => {
          expect(
            createShiftContract.input.decode({
              params: { locationId: 'location-1' },
              body: {
                startsAt: '2026-08-22T13:00:00.000Z',
                endsAt: '2026-08-22T21:00:00.000Z',
                timezone: 'America/New_York',
                effectiveFolderCount: 4,
                idempotencyKey: 'create-shift-command-1',
              },
              actorId,
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              startsAt: '2026-08-22T13:00:00.000Z',
              endsAt: '2026-08-22T21:00:00.000Z',
              timezone: 'America/New_York',
              effectiveFolderCount: 4,
              idempotencyKey: 'create-shift-command-1',
              actorId,
            },
          });
        },
      },
    ],
  });

  it('retains body, params, and actor issue locations', () => {
    const decoded = createShiftContract.input.decode({
      params: { locationId: '' },
      body: {
        startsAt: 'not-a-date',
        endsAt: 'also-not-a-date',
        timezone: '',
        effectiveFolderCount: 0,
        idempotencyKey: 'short',
        undeclared: true,
      },
      actorId: '',
    });

    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['body', 'params', 'actorId']),
      );
  });

  it('round-trips the canonical shift result and exact expected failures', () => {
    const shift = {
      id: shiftId,
      locationId: 'location-1',
      startsAt: '2026-08-22T13:00:00.000Z',
      endsAt: '2026-08-22T21:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 4,
      status: 'open' as const,
      version: 1,
    };
    expect(
      createShiftContract.output.decode(
        createShiftContract.output.encode(shift),
      ),
    ).toEqual({ kind: 'valid', value: shift });

    const failure = {
      kind: 'validation' as const,
      classification: 'semantic' as const,
      code: 'production_shift_window_invalid' as const,
      message: 'Shift end must be after shift start.' as const,
      safeMessage: 'Shift end must be after shift start.' as const,
    };
    expect(
      createShiftContract.failure.decode(
        createShiftContract.failure.encode(failure),
      ),
    ).toEqual({ kind: 'valid', value: failure });
  });
});
