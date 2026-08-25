import { proveOperation } from '@pressly/testkit/operation-proof';
import { recordOrderIntakeCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { recordOrderIntakeHttpSurfaces } from './http.ts';

const surface = recordOrderIntakeHttpSurfaces[0];
const orderId = '10000000-0000-4000-8000-000000000001';
const body = {
  bagCount: 3,
  expectedVersion: 2,
  idempotencyKey: 'record-intake-command-1',
};

describe('record order intake HTTP boundary', () => {
  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact route, limit, and authenticated actor context',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'PUT',
            path: '/production/locations/:locationId/orders/:productionOrderId/intake',
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
        body: { ...body, bagCount: -1 },
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

  it('validates params before reading authenticated context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: '', productionOrderId: 'not-an-id' },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'invalid_params_type', status: 400 }),
    );
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: 'location-1', productionOrderId: orderId },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'missing_auth_principal', status: 401 }),
    );
  });

  it('maps valid input without exposing private host context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.toSerializedInput({
        params: { locationId: 'location-1', productionOrderId: orderId },
        query: {},
        headers: {},
        body,
        context: { actorId: 'actor-1', privateHostValue: true },
      }),
    ).toEqual({
      body,
      params: { locationId: 'location-1', productionOrderId: orderId },
      actorId: 'actor-1',
    });
  });

  it('serializes success and maps exact expected failure statuses', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.present({
        kind: 'success',
        value: {
          locationId: 'location-1',
          orderId,
          bagCount: 3,
          bagCountProvenance: 'operator_intake',
          intakeVersion: 2,
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
          orderId,
          bagCount: 3,
          bagCountProvenance: 'operator_intake',
          intakeVersion: 2,
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
    ).toThrow(expect.objectContaining({ status: 404 }));
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
    ).toThrow(expect.objectContaining({ status: 409 }));
  });
});
