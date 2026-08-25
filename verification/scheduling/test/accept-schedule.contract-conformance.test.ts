import { acceptScheduleCellDeclaration } from '@pressly/production-system/operations/scheduling/accept-schedule/cell';
import { acceptScheduleContract } from '@pressly/production-system/operations/scheduling/accept-schedule/contract';
import { describe, expect, it } from 'vitest';

const actorId = '35000000-0000-4000-8000-000000000001';
const scheduleRunId = '35000000-0000-4000-8000-000000000004';
const body = Object.freeze({
  expectedOutputPlanHash: 'a'.repeat(64),
  acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'] as const,
  idempotencyKey: 'accept-schedule-contract-1',
});
const params = Object.freeze({
  locationId: 'location-accept-schedule-conformance',
  scheduleRunId,
});

describe('accept-schedule public contract conformance', () => {
  it('decodes body before params and preserves caller warning order with actor context', () => {
    expect(
      acceptScheduleContract.input.decode({ body, params, actorId }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: params.locationId,
        scheduleRunId,
        actorId,
        ...body,
      },
    });

    const invalid = acceptScheduleContract.input.decode({
      body: { ...body, expectedOutputPlanHash: 'not-a-hash' },
      params: { locationId: '', scheduleRunId: 'not-a-uuid' },
      actorId: '',
    });
    expect(invalid).toMatchObject({ kind: 'invalid' });
    if (invalid.kind === 'invalid') {
      expect(invalid.issues[0]?.path[0]).toBe('body');
      expect(
        invalid.issues.findIndex((issue) => issue.path[0] === 'params'),
      ).toBeGreaterThan(0);
      expect(invalid.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it('declares the exact selected authenticated after-input accept boundary', () => {
    expect(acceptScheduleCellDeclaration).toMatchObject({
      id: 'production.accept-schedule.v1',
      authentication: 'required',
      authorization: {
        capability: 'production:accept',
        timing: 'after-input',
      },
      surfaces: [
        {
          kind: 'http',
          method: 'POST',
          path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
          bodyLimit: '64kb',
          authorization: 'staged',
          contextRequirements: ['authenticated-actor'],
          validateRequest: expect.any(Function),
        },
      ],
    });
    const authorization = acceptScheduleCellDeclaration.authorization;
    expect(authorization?.timing).toBe('after-input');
    if (authorization?.timing !== 'after-input') return;
    expect(
      authorization.scope({
        locationId: params.locationId,
        scheduleRunId,
        actorId,
        ...body,
      }),
    ).toBe(params.locationId);
  });
});
