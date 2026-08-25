import { proveOperation } from '@pressly/testkit/operation-proof';
import { startScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { startScheduleHttpSurfaces } from './http.ts';

const scheduleRunId = '10000000-0000-4000-8000-000000000001';
const body = {
  expectedOutputPlanHash: 'a'.repeat(64),
  idempotencyKey: 'start-schedule-1',
};
const surface = startScheduleHttpSurfaces[0];

describe('start schedule HTTP', () => {
  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves the route, authentication context, and body-params-auth order',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            method: 'POST',
            path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
            bodyLimit: '64kb',
            authorization: 'staged',
            contextRequirements: ['authenticated-actor'],
          });
          if (surface === undefined) return;
          expect(() =>
            surface.toSerializedInput({
              params: { locationId: '', scheduleRunId: 'bad' },
              query: {},
              headers: {},
              body: {},
              context: {},
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_body_type' }));
          expect(() =>
            surface.toSerializedInput({
              params: { locationId: '', scheduleRunId: 'bad' },
              query: {},
              headers: {},
              body,
              context: {},
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
          expect(() =>
            surface.toSerializedInput({
              params: { locationId: 'location-1', scheduleRunId },
              query: {},
              headers: {},
              body,
              context: {},
            }),
          ).toThrow(
            expect.objectContaining({ code: 'missing_auth_principal' }),
          );
          expect(
            surface.toSerializedInput({
              params: { locationId: 'location-1', scheduleRunId },
              query: {},
              headers: {},
              body,
              context: { actorId: 'actor-1' },
            }),
          ).toEqual({
            params: { locationId: 'location-1', scheduleRunId },
            body,
            actorId: 'actor-1',
          });
          expect(
            surface.decodeAuthorizationScope?.({
              params: { locationId: 'location-1', scheduleRunId },
              query: {},
              headers: {},
            }),
          ).toEqual({ kind: 'valid', value: 'location-1' });
        },
      },
    ],
  });

  it('presents 201 and preserves expected failure carriers', () => {
    if (surface === undefined) return;
    expect(
      surface.present({
        kind: 'success',
        value: {
          scheduleRunId,
          productionRunId: '10000000-0000-4000-8000-000000000002',
          productionBatchIds: ['10000000-0000-4000-8000-000000000003'],
          queueVersion: 1,
          startedAt: '2026-08-22T15:00:00.000Z',
          replayed: false,
        },
      }),
    ).toMatchObject({ status: 201, body: { ok: true } });
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'not_found',
          code: 'schedule_not_found',
          message: 'missing',
          safeMessage: 'missing',
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'schedule_not_found' }));
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'schedule_hash_mismatch',
          message: 'stale',
          safeMessage: 'stale',
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'schedule_hash_mismatch' }));
  });
});
