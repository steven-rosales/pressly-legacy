import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryPlansCellDeclaration } from './cell.ts';
import type { HttpRequest } from '@pressly/cells';
import type { ListProductionHistoryPlansResult } from '../../../read-models/production-history/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { listHistoryPlansContract } from './contract.ts';
import {
  listHistoryPlansCursorInvalid,
  listHistoryPlansLocationNotFound,
} from './failures.ts';
import { listHistoryPlansHttpSurfaces } from './http.ts';

const surface = listHistoryPlansHttpSurfaces[0]!;
const request = (
  input: {
    locationId?: string;
    query?: unknown;
  } = {},
): HttpRequest => ({
  params: { locationId: input.locationId ?? 'location-1' },
  query: input.query ?? {},
  headers: {},
  body: undefined,
  context: {},
});

const emptyResult: ListProductionHistoryPlansResult = {
  items: [],
  nextCursor: null,
  asOf: '2026-08-21T15:00:00.000Z',
};

describe('list-history-plans HTTP declaration', () => {
  proveOperation({
    operationId: 'production.list-history-plans.v1',
    declaration: listHistoryPlansCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact GET route with no body parser limit',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'GET',
            path: '/production/locations/:locationId/history/plans',
            bodyLimit: null,
            authorization: 'staged',
            invalidRequest: { authorizationScope: null, input: null },
          });
        },
      },
    ],
  });

  it('coerces and trims the query before contract decode', () => {
    const serialized = surface.toSerializedInput(
      request({ query: { limit: '25', search: '  plan  ' } }),
    );
    expect(serialized).toEqual({
      params: { locationId: 'location-1' },
      query: { limit: 25, search: 'plan' },
    });
    expect(listHistoryPlansContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: { locationId: 'location-1', limit: 25, search: 'plan' },
    });
  });

  it('preserves separate default params and query validation errors', () => {
    for (const [invalidRequest, expected] of [
      [
        request({ locationId: '' }),
        { code: 'invalid_params_type', location: 'params' },
      ],
      [
        request({ query: { limit: 101 } }),
        { code: 'invalid_query_type', location: 'query' },
      ],
    ] as const) {
      try {
        surface.toSerializedInput(invalidRequest);
        expect.unreachable('invalid request should throw');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error))
          expect(error).toMatchObject({
            code: expected.code,
            message: `Validation ${expected.location} failed.`,
            safeMessage: 'Invalid request input.',
            status: 400,
            publicDetails: {
              location: expected.location,
              issues: expect.any(Array),
            },
          });
      }
    }
  });

  it('keeps the current query-before-params validation priority', () => {
    try {
      surface.toSerializedInput(
        request({ locationId: '', query: { limit: 101 } }),
      );
      expect.unreachable('invalid request should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error).toMatchObject({
          code: 'invalid_query_type',
          publicDetails: { location: 'query' },
        });
    }
  });

  it('presents the current success envelope and expected error statuses', () => {
    expect(surface.present({ kind: 'success', value: emptyResult })).toEqual({
      status: 200,
      body: { ok: true, data: emptyResult },
    });

    for (const [failure, expected] of [
      [
        listHistoryPlansLocationNotFound(),
        { status: 404, kind: 'NotFoundError' },
      ],
      [
        listHistoryPlansCursorInvalid(),
        { status: 400, kind: 'ValidationError' },
      ],
    ] as const) {
      try {
        surface.present({ kind: 'failure', failure });
        expect.unreachable('expected failure should reach the error boundary');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error)) expect(error).toMatchObject(expected);
      }
    }
  });
});
