import { proveOperation } from '@pressly/testkit/operation-proof';
import { updateShiftCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { updateShiftNotFound, updateShiftWindowInvalid } from './failures.ts';
import { updateShiftContract } from './contract.ts';
import type { UpdateShiftCommand, UpdateShiftResult } from './types.ts';

const command: UpdateShiftCommand = {
  locationId: 'location-1',
  productionShiftId: '10000000-0000-4000-8000-000000000001',
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  actorId: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'update-shift-command-1',
};

const outcome: UpdateShiftResult = {
  productionShift: {
    id: command.productionShiftId,
    locationId: command.locationId,
    startsAt: command.startsAt,
    endsAt: command.endsAt,
    timezone: 'America/New_York',
    effectiveFolderCount: command.effectiveFolderCount,
    status: 'open',
    version: 2,
  },
  supersededScheduleRunId: '10000000-0000-4000-8000-000000000003',
  replayed: false,
};

describe('update shift contract', () => {
  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the deployed body, params, and trusted actor context',
        proves: ['contract'],
        run: () => {
          const serialized = updateShiftContract.input.encode(command);
          expect(serialized).toEqual({
            params: {
              locationId: command.locationId,
              productionShiftId: command.productionShiftId,
            },
            body: {
              startsAt: command.startsAt,
              endsAt: command.endsAt,
              effectiveFolderCount: command.effectiveFolderCount,
              expectedVersion: command.expectedVersion,
              idempotencyKey: command.idempotencyKey,
            },
            actorId: command.actorId,
          });
          expect(updateShiftContract.input.decode(serialized)).toEqual({
            kind: 'valid',
            value: command,
          });
        },
      },
    ],
  });

  it('retains body-before-params issue ordering and actor context issues', () => {
    const decoded = updateShiftContract.input.decode({
      body: {
        startsAt: 'bad',
        endsAt: 'bad',
        effectiveFolderCount: 0,
        expectedVersion: 0,
        idempotencyKey: 'short',
      },
      params: { locationId: '', productionShiftId: 'bad' },
      actorId: '',
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid') {
      expect(decoded.issues[0]?.path[0]).toBe('body');
      expect(decoded.issues.some((issue) => issue.path[0] === 'params')).toBe(
        true,
      );
      expect(decoded.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it('round-trips the exact result and closed expected failure algebra', () => {
    expect(
      updateShiftContract.output.decode(
        updateShiftContract.output.encode(outcome),
      ),
    ).toEqual({ kind: 'valid', value: outcome });
    for (const failure of [updateShiftWindowInvalid(), updateShiftNotFound()])
      expect(
        updateShiftContract.failure.decode(
          updateShiftContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
    expect(
      updateShiftContract.failure.decode({
        kind: 'conflict',
        code: 'unrecognized',
        message: 'No.',
        safeMessage: 'No.',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
