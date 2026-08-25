import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadBoardCellDeclaration } from './cell.ts';
import type { ProductionBoard } from '../../../read-models/production-board/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { loadBoardContract } from './contract.ts';
import { loadBoardNotFound } from './failures.ts';

const ids = {
  shift: '32000000-0000-4000-8000-000000000001',
  run: '32000000-0000-4000-8000-000000000002',
} as const;

const result: ProductionBoard = {
  productionShift: {
    id: ids.shift,
    locationId: 'location-1',
    startsAt: '2026-08-21T12:00:00.000Z',
    endsAt: '2026-08-21T20:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    status: 'open',
    version: 1,
  },
  productionRun: {
    id: ids.run,
    productionShiftId: ids.shift,
    status: 'started',
    queueVersion: 1,
    plannedCompletionAt: '2026-08-21T18:00:00.000Z',
    overtimeAcknowledgement: null,
    version: 1,
  },
  batches: [],
  eligibleOrders: [],
  asOf: '2026-08-21T15:00:00.000Z',
};

describe('load-board cell contract', () => {
  proveOperation({
    operationId: 'production.load-board.v1',
    declaration: loadBoardCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes and encodes the strict location/run identity',
        proves: ['contract'],
        run: () => {
          const serialized = {
            params: { locationId: 'location-1', productionRunId: ids.run },
          };
          expect(loadBoardContract.input.decode(serialized)).toEqual({
            kind: 'valid',
            value: { locationId: 'location-1', productionRunId: ids.run },
          });
          expect(
            loadBoardContract.input.encode({
              locationId: 'location-1',
              productionRunId: ids.run,
            }),
          ).toEqual(serialized);
        },
      },
    ],
  });

  it('rejects missing, malformed, and unknown path fields', () => {
    for (const params of [
      { productionRunId: ids.run },
      { locationId: 'location-1', productionRunId: 'not-a-uuid' },
      {
        locationId: 'location-1',
        productionRunId: ids.run,
        extra: true,
      },
    ]) {
      const decoded = loadBoardContract.input.decode({ params });
      expect(decoded.kind).toBe('invalid');
      if (decoded.kind === 'invalid')
        expect(decoded.issues.every(({ path }) => path[0] === 'params')).toBe(
          true,
        );
    }
  });

  it('round-trips the complete strict board without Processor identity data', () => {
    const encoded = loadBoardContract.output.encode(result);
    expect(loadBoardContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: result,
    });
    expect(
      loadBoardContract.output.decode({
        ...result,
        operationalOrderIdentities: [],
      }).kind,
    ).toBe('invalid');

    try {
      loadBoardContract.output.encode({ ...result, asOf: 'not-an-instant' });
      expect.unreachable('invalid output should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error.code).toBe('invalid_api_success_response');
    }
  });

  it('versions and round-trips the exact missing-board failure', () => {
    const failure = loadBoardNotFound();
    const encoded = loadBoardContract.failure.encode(failure);
    expect(loadBoardContract.failure.decode(encoded)).toEqual({
      kind: 'valid',
      value: failure,
    });
    expect(loadBoardContract.input.version).toBe(1);
    expect(loadBoardContract.output.version).toBe(1);
    expect(loadBoardContract.failure.version).toBe(1);
  });
});
