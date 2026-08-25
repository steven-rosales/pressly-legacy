import { proveOperation } from '@pressly/testkit/operation-proof';
import { replaceShiftSelectionCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { replaceShiftSelectionContract } from './contract.ts';
import {
  replaceShiftSelectionAlreadyStarted,
  replaceShiftSelectionIdempotencyConflict,
  replaceShiftSelectionNotFound,
  replaceShiftSelectionNotReady,
  replaceShiftSelectionPlanStateInvalid,
  replaceShiftSelectionScheduleVersionConflict,
  replaceShiftSelectionVersionConflict,
} from './failures.ts';
import type { ReplaceShiftSelectionResult } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  order1: '10000000-0000-4000-8000-000000000003',
  order2: '10000000-0000-4000-8000-000000000004',
  schedule: '10000000-0000-4000-8000-000000000005',
} as const;

const serializedInput = {
  params: { locationId: 'location-1', productionShiftId: ids.shift },
  body: {
    selectedOrderIds: [ids.order2, ids.order1],
    expectedVersion: 2,
    idempotencyKey: 'replace-selection-command-1',
  },
  actorId: ids.actor,
};

const result: ReplaceShiftSelectionResult = {
  selection: {
    productionShiftId: ids.shift,
    version: 3,
    selectedOrderIds: [ids.order1, ids.order2],
  },
  supersededScheduleRunId: ids.schedule,
  replayed: false,
};

describe('replace shift selection contract', () => {
  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes and re-encodes the strict request as sorted unique input',
        proves: ['contract'],
        run: () => {
          const expected = {
            locationId: 'location-1',
            productionShiftId: ids.shift,
            actorId: ids.actor,
            selectedOrderIds: [ids.order1, ids.order2],
            expectedVersion: 2,
            idempotencyKey: 'replace-selection-command-1',
          };
          expect(
            replaceShiftSelectionContract.input.decode(serializedInput),
          ).toEqual({ kind: 'valid', value: expected });
          expect(replaceShiftSelectionContract.input.encode(expected)).toEqual({
            ...serializedInput,
            body: {
              ...serializedInput.body,
              selectedOrderIds: [ids.order1, ids.order2],
            },
          });
        },
      },
    ],
  });

  it('retains canonical duplicate rejection and body-before-params issues', () => {
    const decoded = replaceShiftSelectionContract.input.decode({
      params: { locationId: '', productionShiftId: 'not-a-uuid' },
      body: {
        selectedOrderIds: [ids.order1, ids.order1],
        expectedVersion: -1,
        idempotencyKey: 'short',
      },
      actorId: '',
    });
    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid') {
      const locations = decoded.issues.map((issue) => issue.path[0]);
      expect(locations[0]).toBe('body');
      expect(locations).toEqual(
        expect.arrayContaining(['body', 'params', 'actorId']),
      );
    }
  });

  it('round-trips the canonical result and every exact expected failure', () => {
    expect(
      replaceShiftSelectionContract.output.decode(
        replaceShiftSelectionContract.output.encode(result),
      ),
    ).toEqual({ kind: 'valid', value: result });

    for (const failure of [
      replaceShiftSelectionIdempotencyConflict(),
      replaceShiftSelectionNotFound(),
      replaceShiftSelectionAlreadyStarted(),
      replaceShiftSelectionVersionConflict(),
      replaceShiftSelectionNotReady(),
      replaceShiftSelectionPlanStateInvalid(),
      replaceShiftSelectionScheduleVersionConflict(),
    ])
      expect(
        replaceShiftSelectionContract.failure.decode(
          replaceShiftSelectionContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });

  it('fails closed when application output violates the canonical result', () => {
    try {
      replaceShiftSelectionContract.output.encode({
        ...result,
        selection: {
          ...result.selection,
          selectedOrderIds: [ids.order1, ids.order1],
        },
      });
      expect.unreachable('Invalid output must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_api_success_response',
        status: 500,
      });
    }
  });
});
