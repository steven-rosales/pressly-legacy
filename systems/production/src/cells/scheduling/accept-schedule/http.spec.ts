import { proveOperation } from '@pressly/testkit/operation-proof';
import { acceptScheduleCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { acceptScheduleContract } from './contract.ts';
import { acceptScheduleConflict, acceptScheduleNotFound } from './failures.ts';
import { acceptScheduleHttpSurfaces } from './http.ts';
import type { AcceptScheduleResult } from './types.ts';

const surface = acceptScheduleHttpSurfaces[0];
const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  schedule: '10000000-0000-4000-8000-000000000002',
  shift: '10000000-0000-4000-8000-000000000003',
} as const;
const outputHash = 'a'.repeat(64);
const validBody = {
  expectedOutputPlanHash: outputHash,
  acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
  idempotencyKey: 'accept-schedule-command-1',
};
const accepted: AcceptScheduleResult = {
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  acceptedAt: '2026-08-22T14:00:00.000Z',
  replayed: false,
};

describe('accept schedule HTTP boundary', () => {
  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves body then params validation before actor context',
        proves: ['protocol'],
        run: () => {
          expect(surface).toBeDefined();
          if (surface === undefined) return;
          try {
            surface.validateRequest?.({
              params: { locationId: '', scheduleRunId: 'not-a-uuid' },
              query: {},
              headers: {},
              body: { ...validBody, expectedOutputPlanHash: 'bad-hash' },
            });
            expect.unreachable('Invalid request must throw.');
          } catch (error) {
            expect(error).toMatchObject({
              code: 'invalid_body_type',
              status: 400,
              publicDetails: { location: 'body' },
            });
          }
        },
      },
    ],
  });

  it('validates params only after a valid body', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.validateRequest?.({
        params: { locationId: '', scheduleRunId: 'not-a-uuid' },
        query: {},
        headers: {},
        body: validBody,
      });
      expect.unreachable('Invalid params must throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_params_type',
        status: 400,
        publicDetails: { location: 'params' },
      });
    }
  });

  it('decodes actor context without sorting acknowledgements and presents 201', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const serialized = surface.toSerializedInput({
      params: { locationId: 'location-1', scheduleRunId: ids.schedule },
      query: {},
      headers: {},
      body: validBody,
      context: { actorId: ids.actor },
    });
    expect(acceptScheduleContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        locationId: 'location-1',
        scheduleRunId: ids.schedule,
        actorId: ids.actor,
        ...validBody,
      },
    });
    expect(surface.present({ kind: 'success', value: accepted })).toEqual({
      status: 201,
      body: { ok: true, data: accepted },
    });
  });

  it('decodes the validated location scope before actor context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.decodeAuthorizationScope?.({
        params: { locationId: 'location-1', scheduleRunId: ids.schedule },
        query: {},
        headers: {},
      }),
    ).toEqual({ kind: 'valid', value: 'location-1' });
  });

  it('maps not-found and conflict failures to exact AppErrors', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    for (const [failure, status] of [
      [acceptScheduleNotFound(), 404],
      [
        acceptScheduleConflict(
          'schedule_hash_mismatch',
          'The schedule proposal changed before acceptance.',
        ),
        409,
      ],
    ] as const) {
      try {
        surface.present({ kind: 'failure', failure });
        expect.unreachable('Expected failure must throw.');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        expect(error).toMatchObject({ code: failure.code, status });
      }
    }
  });
});
