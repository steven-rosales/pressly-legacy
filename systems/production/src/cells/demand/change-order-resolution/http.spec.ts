import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeOrderResolutionCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { changeOrderResolutionHttpSurfaces } from './http.ts';

const surface = changeOrderResolutionHttpSurfaces[0];
const orderId = '10000000-0000-4000-8000-000000000001';
const body = {
  action: 'resolve_without_production',
  reason: 'processor_not_in_use',
  note: null,
  confirmReviewedFacts: false,
  expectedVersion: 4,
  idempotencyKey: 'resolve-order-command-1',
};

describe('change order resolution HTTP boundary', () => {
  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact route, limit, and actor context requirement',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'PUT',
            path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
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
        body: { action: 'invalid' },
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

  it('validates params before reading actor context', () => {
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
    ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: 'location-1', productionOrderId: orderId },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
  });

  it('maps the public body without inventing the internal source precondition', () => {
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

  it('serializes success and exact expected failure statuses', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.present({
        kind: 'success',
        value: {
          locationId: 'location-1',
          orderId,
          action: 'resolve_without_production',
          resolutionState: 'resolved_without_production',
          transitionedAt: '2026-08-21T15:00:00.000Z',
          version: 5,
          replayed: false,
        },
      }),
    ).toMatchObject({ status: 200, body: { ok: true } });
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
          code: 'production_order_resolution_blocked',
          message: 'The order cannot be resolved.',
          safeMessage: 'The order cannot be resolved.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
  });
});
