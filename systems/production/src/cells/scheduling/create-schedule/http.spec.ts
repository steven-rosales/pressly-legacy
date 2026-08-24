import { proveOperation } from '@pressly/testkit/operation-proof';
import { createScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { createScheduleHttpSurfaces } from './http.ts';
const surface = createScheduleHttpSurfaces[0];
const body = {
  productionShiftId: '10000000-0000-4000-8000-000000000001',
  schedulerConfigId: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'create-schedule-1',
};
describe('create schedule HTTP', () => {
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares exact route and body precedence',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            method: 'POST',
            path: '/production/locations/:locationId/schedules',
            contextRequirements: ['authenticated-actor'],
          });
          if (!surface) return;
          expect(() =>
            surface.toSerializedInput({
              params: { locationId: '' },
              query: {},
              headers: {},
              body: {},
              context: {},
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_body_type' }));
          expect(() =>
            surface.toSerializedInput({
              params: { locationId: '' },
              query: {},
              headers: {},
              body,
              context: {},
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
          expect(
            surface.toSerializedInput({
              params: { locationId: 'location' },
              query: {},
              headers: {},
              body,
              context: { actorId: 'actor' },
            }),
          ).toEqual({
            params: { locationId: 'location' },
            body,
            actorId: 'actor',
          });
        },
      },
    ],
  });

  it('decodes validated location scope before actor context and full decoding', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.decodeAuthorizationScope?.({
        params: { locationId: 'location-1' },
        query: {},
        headers: {},
      }),
    ).toEqual({ kind: 'valid', value: 'location-1' });
  });
});
