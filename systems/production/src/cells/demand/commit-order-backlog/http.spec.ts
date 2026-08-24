import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderBacklogCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { commitOrderBacklogHttpSurfaces } from './http.ts';

const surface = commitOrderBacklogHttpSurfaces[0];
const body = {
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  previewHash: 'a'.repeat(64),
  idempotencyKey: 'commit-backlog-http-1',
} as const;

describe('commit order backlog HTTP boundary', () => {
  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact route, body limit, and trusted actor context',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/order-backlog',
            bodyLimit: '64kb',
            contextRequirements: ['authenticated-actor'],
          });
        },
      },
    ],
  });

  it('preserves body-before-params validation before actor lookup', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.toSerializedInput({
        params: { locationId: '' },
        query: {},
        headers: {},
        body: { ...body, filter: 'wrong' },
        context: {},
      });
      expect.unreachable('Invalid body must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_body_type',
        status: 400,
        publicDetails: { location: 'body' },
      });
    }
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: '' },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
    expect(() =>
      surface.toSerializedInput({
        params: { locationId: 'location-1' },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
  });

  it('maps defaults and actor without exposing host context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.toSerializedInput({
        params: { locationId: 'location-1' },
        query: {},
        headers: {},
        body,
        context: { actorId: 'actor-1', privateHostValue: true },
      }),
    ).toEqual({
      params: { locationId: 'location-1' },
      body: { ...body, cursor: null, maxOrders: 250, note: null },
      actorId: 'actor-1',
    });
  });

  it('serializes success and presents validation versus conflict failures', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const result = {
      locationId: 'location-1',
      bulkOperationId: '75000000-0000-4000-8000-000000000001',
      previewHash: body.previewHash,
      nextCursor: null,
      resolvedCount: 0,
      resolved: [],
      committedAt: '2026-08-22T16:00:00.000Z',
      replayed: false,
    };
    expect(surface.present({ kind: 'success', value: result })).toEqual({
      status: 200,
      body: { ok: true, data: result },
    });
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'validation',
          classification: 'malformed',
          code: 'production_order_backlog_cursor_invalid',
          message: 'The cursor is invalid.',
          safeMessage: 'The cursor is invalid.',
          details: { reason: 'production_order_backlog_cursor_invalid' },
        },
      }),
    ).toThrow(expect.objectContaining({ status: 400 }));
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'conflict',
          code: 'production_order_backlog_preview_stale',
          message: 'The preview is stale.',
          safeMessage: 'The preview is stale.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
  });
});
