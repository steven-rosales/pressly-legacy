import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { attemptAutomaticPlacementCellDeclaration } from './cell.ts';
import { decideAutomaticPlacementRun } from './decide.ts';

describe('automatic-placement run decision', () => {
  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'records the exact awaiting-run state when no run has started',
        proves: ['decision'],
        run: () => {
          expect(decideAutomaticPlacementRun([])).toEqual({
            kind: 'record',
            placement: {
              status: 'awaiting_run',
              reason: 'no_started_run',
              message: 'This order is waiting for a production run to start.',
            },
          });
        },
      },
    ],
  });

  it('delegates the only started run with its current queue version', () => {
    expect(
      decideAutomaticPlacementRun([
        { productionRunId: 'run-1', queueVersion: 7 },
      ]),
    ).toEqual({
      kind: 'place',
      run: { productionRunId: 'run-1', queueVersion: 7 },
    });
  });

  it('records sorted candidates when several runs are active', () => {
    expect(
      decideAutomaticPlacementRun([
        { productionRunId: 'run-c', queueVersion: 1 },
        { productionRunId: 'run-a', queueVersion: 2 },
        { productionRunId: 'run-b', queueVersion: 3 },
      ]),
    ).toEqual({
      kind: 'record',
      placement: {
        status: 'ambiguous_run',
        reason: 'multiple_started_runs',
        message:
          'More than one production run is active; choose the intended run before placing this order.',
        candidateProductionRunIds: ['run-a', 'run-b', 'run-c'],
      },
    });
  });
});
