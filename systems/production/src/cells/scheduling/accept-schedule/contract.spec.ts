import { proveOperation } from '@pressly/testkit/operation-proof';
import { acceptScheduleCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { acceptScheduleContract } from './contract.ts';
import {
  acceptScheduleCasConflict,
  acceptScheduleConflict,
  acceptScheduleNotFound,
} from './failures.ts';
import type { AcceptScheduleResult } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  schedule: '10000000-0000-4000-8000-000000000002',
  shift: '10000000-0000-4000-8000-000000000003',
} as const;
const outputHash = 'a'.repeat(64);

const serializedInput = {
  params: { locationId: 'location-1', scheduleRunId: ids.schedule },
  body: {
    expectedOutputPlanHash: outputHash,
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
    idempotencyKey: 'accept-schedule-command-1',
  },
  actorId: ids.actor,
} as const;

const accepted: AcceptScheduleResult = {
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  acceptedAt: '2026-08-22T14:00:00.000Z',
  replayed: false,
};

describe('accept schedule contract', () => {
  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the strict request without sorting warning acknowledgements',
        proves: ['contract'],
        run: () => {
          const expected = {
            locationId: 'location-1',
            scheduleRunId: ids.schedule,
            expectedOutputPlanHash: outputHash,
            acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
            idempotencyKey: 'accept-schedule-command-1',
            actorId: ids.actor,
          } as const;
          expect(acceptScheduleContract.input.decode(serializedInput)).toEqual({
            kind: 'valid',
            value: expected,
          });
          expect(acceptScheduleContract.input.encode(expected)).toEqual(
            serializedInput,
          );
        },
      },
    ],
  });

  it('retains the canonical duplicate-warning quirk for policy rejection', () => {
    expect(
      acceptScheduleContract.input.decode({
        ...serializedInput,
        body: {
          ...serializedInput.body,
          acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'SHIFT_OVERFLOW'],
        },
      }),
    ).toMatchObject({
      kind: 'valid',
      value: {
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'SHIFT_OVERFLOW'],
      },
    });
  });

  it('retains body-before-params issue order', () => {
    const decoded = acceptScheduleContract.input.decode({
      params: { locationId: '', scheduleRunId: 'not-a-uuid' },
      body: {
        expectedOutputPlanHash: 'bad-hash',
        acknowledgedWarningCodes: ['UNKNOWN'],
        idempotencyKey: 'short',
      },
      actorId: '',
    });
    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid') {
      const locations = decoded.issues.map((issue) => issue.path[0]);
      expect(locations[0]).toBe('body');
      expect(locations).toEqual(
        expect.arrayContaining(['body', 'params', 'actorId']),
      );
    }
  });

  it('round-trips the canonical result and representative exact failures', () => {
    expect(
      acceptScheduleContract.output.decode(
        acceptScheduleContract.output.encode(accepted),
      ),
    ).toEqual({ kind: 'valid', value: accepted });
    for (const failure of [
      acceptScheduleNotFound(),
      acceptScheduleConflict(
        'schedule_warning_not_acknowledged',
        'Blocking warning SHIFT_OVERFLOW must be acknowledged.',
      ),
      acceptScheduleCasConflict(),
    ])
      expect(
        acceptScheduleContract.failure.decode(
          acceptScheduleContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });

  it('fails closed when application success violates the canonical result', () => {
    try {
      acceptScheduleContract.output.encode({
        ...accepted,
        acceptedAt: 'not-an-instant',
      });
      expect.unreachable('Invalid output must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_api_success_response',
        status: 500,
      });
    }
  });
});
