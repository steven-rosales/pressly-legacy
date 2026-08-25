import { proveOperation } from '@pressly/testkit/operation-proof';
import { replaceShiftSelectionCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { replaceShiftSelectionContract } from './contract.ts';
import {
  replaceShiftSelectionNotFound,
  replaceShiftSelectionVersionConflict,
} from './failures.ts';
import { replaceShiftSelectionHttpSurfaces } from './http.ts';
import type { ReplaceShiftSelectionResult } from './types.ts';

const surface = replaceShiftSelectionHttpSurfaces[0];
const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  order1: '10000000-0000-4000-8000-000000000003',
  order2: '10000000-0000-4000-8000-000000000004',
} as const;

const validBody = {
  selectedOrderIds: [ids.order2, ids.order1],
  expectedVersion: 1,
  idempotencyKey: 'replace-selection-command-1',
};

const result: ReplaceShiftSelectionResult = {
  selection: {
    productionShiftId: ids.shift,
    version: 2,
    selectedOrderIds: [ids.order1, ids.order2],
  },
  supersededScheduleRunId: null,
  replayed: false,
};

describe('replace shift selection HTTP boundary', () => {
  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'stages validated location authorization after exact body-then-params validation',
        proves: ['protocol'],
        run: () => {
          expect(surface).toBeDefined();
          if (surface === undefined || surface.validateRequest === null) return;
          expect(() =>
            surface.validateRequest?.({
              params: { locationId: '', productionShiftId: 'not-a-uuid' },
              query: {},
              headers: {},
              body: { ...validBody, expectedVersion: -1 },
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_body_type' }));
          expect(() =>
            surface.validateRequest?.({
              params: { locationId: '', productionShiftId: 'not-a-uuid' },
              query: {},
              headers: {},
              body: validBody,
            }),
          ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
          expect(
            surface.decodeAuthorizationScope?.({
              params: {
                locationId: 'location-1',
                productionShiftId: ids.shift,
              },
              query: {},
              headers: {},
            }),
          ).toEqual({ kind: 'valid', value: 'location-1' });
        },
      },
    ],
  });

  it('preserves body then params validation before actor context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.toSerializedInput({
        params: { locationId: '', productionShiftId: 'not-a-uuid' },
        query: {},
        headers: {},
        body: { ...validBody, expectedVersion: -1 },
        context: undefined,
      });
      expect.unreachable('Invalid request must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_body_type',
        status: 400,
        publicDetails: { location: 'body' },
      });
    }
  });

  it('validates params after a valid body', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.toSerializedInput({
        params: { locationId: '', productionShiftId: 'not-a-uuid' },
        query: {},
        headers: {},
        body: validBody,
        context: undefined,
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

  it('decodes trusted actor context into sorted input and presents 200 success', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const serialized = surface.toSerializedInput({
      params: { locationId: 'location-1', productionShiftId: ids.shift },
      query: {},
      headers: {},
      body: validBody,
      context: { actorId: ids.actor },
    });
    expect(replaceShiftSelectionContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        locationId: 'location-1',
        productionShiftId: ids.shift,
        actorId: ids.actor,
        selectedOrderIds: [ids.order1, ids.order2],
        expectedVersion: 1,
        idempotencyKey: 'replace-selection-command-1',
      },
    });
    expect(surface.present({ kind: 'success', value: result })).toEqual({
      status: 200,
      body: { ok: true, data: result },
    });
  });

  it('maps not-found and conflict outcomes to exact AppErrors', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    for (const [failure, expected] of [
      [replaceShiftSelectionNotFound(), { status: 404 }],
      [replaceShiftSelectionVersionConflict(), { status: 409 }],
    ] as const) {
      try {
        surface.present({ kind: 'failure', failure });
        expect.unreachable('Expected failure must throw.');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        expect(error).toMatchObject({ code: failure.code, ...expected });
      }
    }
  });
});
