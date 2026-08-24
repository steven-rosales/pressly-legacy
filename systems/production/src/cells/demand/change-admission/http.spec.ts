import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeAdmissionCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { changeAdmissionHttpSurfaces } from './http.ts';

const surface = changeAdmissionHttpSurfaces[0];

describe('change admission HTTP boundary', () => {
  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'keeps the exact route, body limit, and trusted actor context requirement',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'PUT',
            path: '/production/locations/:locationId/orders/:productionOrderId/admission',
            bodyLimit: '64kb',
            contextRequirements: ['authenticated-actor'],
          });
        },
      },
    ],
  });

  it('preserves body-before-params validation precedence', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    try {
      surface.toSerializedInput({
        params: { locationId: '', productionOrderId: 'not-an-id' },
        query: {},
        headers: {},
        body: { target: 'invalid' },
        context: { actorId: 'actor-1' },
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

  it('maps valid transport input without exposing the host context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    expect(
      surface.toSerializedInput({
        params: {
          locationId: 'location-1',
          productionOrderId: '10000000-0000-4000-8000-000000000001',
        },
        query: {},
        headers: {},
        body: {
          target: 'released',
          expectedVersion: 2,
          idempotencyKey: 'change-admission-command-1',
        },
        context: { actorId: 'actor-1', privateHostValue: true },
      }),
    ).toEqual({
      params: {
        locationId: 'location-1',
        productionOrderId: '10000000-0000-4000-8000-000000000001',
      },
      body: {
        target: 'released',
        expectedVersion: 2,
        idempotencyKey: 'change-admission-command-1',
      },
      actorId: 'actor-1',
    });
  });

  it('validates params before reading the actor from host context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    expect(() =>
      surface.toSerializedInput({
        params: { locationId: '', productionOrderId: 'not-an-id' },
        query: {},
        headers: {},
        body: {
          target: 'released',
          expectedVersion: 2,
          idempotencyKey: 'change-admission-command-1',
        },
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_params_type',
        status: 400,
        publicDetails: { location: 'params', issues: expect.any(Array) },
      }),
    );
    expect(() =>
      surface.toSerializedInput({
        params: {
          locationId: 'location-1',
          productionOrderId: '10000000-0000-4000-8000-000000000001',
        },
        query: {},
        headers: {},
        body: {
          target: 'released',
          expectedVersion: 2,
          idempotencyKey: 'change-admission-command-1',
        },
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'missing_auth_principal', status: 401 }),
    );
  });

  it('serializes success and maps expected failures to their exact HTTP errors', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    expect(
      surface.present({
        kind: 'success',
        value: {
          locationId: 'location-1',
          orderId: '10000000-0000-4000-8000-000000000001',
          admissionOverride: 'released',
          status: 'eligible',
          version: 3,
          replayed: false,
        },
      }),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          locationId: 'location-1',
          orderId: '10000000-0000-4000-8000-000000000001',
          admissionOverride: 'released',
          status: 'eligible',
          version: 3,
          replayed: false,
        },
      },
    });
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'not_found',
          code: 'production_order_not_found',
          message: 'The production order was not found.',
          safeMessage: 'The production order was not found.',
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'production_order_not_found',
        status: 404,
      }),
    );
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_order_version_conflict',
          message: 'The production order changed.',
          safeMessage: 'The production order changed.',
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'production_order_version_conflict',
        status: 409,
      }),
    );
  });
});
