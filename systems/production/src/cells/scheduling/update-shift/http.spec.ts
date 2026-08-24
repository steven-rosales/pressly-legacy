import { proveOperation } from '@pressly/testkit/operation-proof';
import { updateShiftCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import {
  updateShiftNotFound,
  updateShiftVersionConflict,
  updateShiftWindowInvalid,
} from './failures.ts';
import { updateShiftHttpSurfaces } from './http.ts';

const surface = updateShiftHttpSurfaces[0];
const shiftId = '10000000-0000-4000-8000-000000000001';
const validBody = {
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  idempotencyKey: 'update-shift-command-1',
};

describe('update shift HTTP boundary', () => {
  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact PATCH surface and actor requirement',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'PATCH',
            path: '/production/locations/:locationId/shifts/:productionShiftId',
            bodyLimit: '64kb',
            contextRequirements: ['authenticated-actor'],
            authorization: 'staged',
          });
        },
      },
    ],
  });

  it('validates without actor context and derives authorization only from the validated path', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.validateRequest?.({
        params: { locationId: 'location-1', productionShiftId: shiftId },
        query: {},
        headers: {},
        body: validBody,
      }),
    ).toBeUndefined();
    expect(
      surface.decodeAuthorizationScope?.({
        params: { locationId: 'location-1', productionShiftId: shiftId },
        query: {},
        headers: {},
      }),
    ).toEqual({ kind: 'valid', value: 'location-1' });
    expect(
      surface.decodeAuthorizationScope?.({
        params: {
          locationId: 'location-1',
          productionShiftId: 'not-a-uuid',
        },
        query: {},
        headers: {},
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('preserves body-before-params validation precedence', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.toSerializedInput({
        params: { locationId: '', productionShiftId: 'bad' },
        query: {},
        headers: {},
        body: { ...validBody, endsAt: 'not-an-instant' },
        context: {},
      });
      expect.unreachable('Invalid input must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_body_type',
        status: 400,
        publicDetails: { location: 'body' },
      });
    }
  });

  it('validates params before resolving actor context and maps valid input', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: '', productionShiftId: 'bad' },
        query: {},
        headers: {},
        body: validBody,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'invalid_params_type', status: 400 }),
    );
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: 'location-1', productionShiftId: shiftId },
        query: {},
        headers: {},
        body: validBody,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'missing_auth_principal', status: 401 }),
    );
    expect(
      surface.toSerializedInput({
        params: { locationId: 'location-1', productionShiftId: shiftId },
        query: {},
        headers: {},
        body: validBody,
        context: { actorId: 'actor-1', privateValue: true },
      }),
    ).toEqual({
      params: { locationId: 'location-1', productionShiftId: shiftId },
      body: validBody,
      actorId: 'actor-1',
    });
  });

  it('presents success and exact 422, 404, and 409 expected errors', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const productionShift = {
      id: shiftId,
      locationId: 'location-1',
      startsAt: validBody.startsAt,
      endsAt: validBody.endsAt,
      timezone: 'America/New_York',
      effectiveFolderCount: validBody.effectiveFolderCount,
      status: 'open' as const,
      version: 2,
    };
    expect(
      surface.present({
        kind: 'success',
        value: {
          productionShift,
          supersededScheduleRunId: null,
          replayed: false,
        },
      }),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          productionShift,
          supersededScheduleRunId: null,
          replayed: false,
        },
      },
    });

    for (const [failure, status] of [
      [updateShiftWindowInvalid(), 422],
      [updateShiftNotFound(), 404],
      [updateShiftVersionConflict(), 409],
    ] as const)
      expect(() => surface.present({ kind: 'failure', failure })).toThrow(
        expect.objectContaining({ code: failure.code, status }),
      );
  });
});
