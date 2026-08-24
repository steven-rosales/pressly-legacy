import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadWorkspaceCellDeclaration } from './cell.ts';
import type { ProductionWorkspace } from '../../../read-models/production-board/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { loadWorkspaceContract } from './contract.ts';
import {
  loadWorkspaceLivePlacementConflict,
  loadWorkspaceLocationNotFound,
  loadWorkspaceShiftNotFound,
} from './failures.ts';

const shiftId = '34000000-0000-4000-8000-000000000001';
const result: ProductionWorkspace = {
  location: {
    id: 'location-1',
    name: 'Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  currentShift: null,
  shiftSelection: null,
  candidateShifts: [],
  currentSchedulerConfig: null,
  currentScheduleProposal: null,
  activeRuns: [],
  orders: [],
  pendingEligibleOrders: [],
  liveRunChanges: null,
  demandOutlook: null,
  board: null,
  stations: [],
  machines: [],
  asOf: '2026-08-21T16:00:00.000Z',
};

describe('load-workspace cell contract', () => {
  proveOperation({
    operationId: 'production.load-workspace.v1',
    declaration: loadWorkspaceCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'uses only optional query shiftId despite tolerant path params',
        proves: ['contract'],
        run: () => {
          expect(
            loadWorkspaceContract.input.decode({
              params: { locationId: 'location-1', shiftId },
              query: {},
            }),
          ).toEqual({ kind: 'valid', value: { locationId: 'location-1' } });
          expect(
            loadWorkspaceContract.input.decode({
              params: { locationId: 'location-1' },
              query: { shiftId },
            }),
          ).toEqual({
            kind: 'valid',
            value: { locationId: 'location-1', shiftId },
          });
          expect(
            loadWorkspaceContract.input.encode({
              locationId: 'location-1',
              shiftId,
            }),
          ).toEqual({
            params: { locationId: 'location-1' },
            query: { shiftId },
          });
        },
      },
    ],
  });

  it('keeps params and query strict', () => {
    const decoded = loadWorkspaceContract.input.decode({
      params: { locationId: '', extra: true },
      query: { shiftId: 'not-a-uuid', extra: true },
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map(({ path }) => path[0])).toEqual(
        expect.arrayContaining(['params', 'query']),
      );
  });

  it('round-trips the strict workspace without identity enrichment', () => {
    const encoded = loadWorkspaceContract.output.encode(result);
    expect(loadWorkspaceContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: result,
    });
    expect(
      loadWorkspaceContract.output.decode({ ...result, identities: [] }).kind,
    ).toBe('invalid');
    try {
      loadWorkspaceContract.output.encode({ ...result, asOf: 'invalid' });
      expect.unreachable('invalid output should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error.code).toBe('invalid_api_success_response');
    }
  });

  it('versions and round-trips all exact failures', () => {
    for (const failure of [
      loadWorkspaceLocationNotFound(),
      loadWorkspaceShiftNotFound(),
      loadWorkspaceLivePlacementConflict(),
    ]) {
      const encoded = loadWorkspaceContract.failure.encode(failure);
      expect(loadWorkspaceContract.failure.decode(encoded)).toEqual({
        kind: 'valid',
        value: failure,
      });
    }
    expect(loadWorkspaceContract.input.version).toBe(1);
    expect(loadWorkspaceContract.output.version).toBe(1);
    expect(loadWorkspaceContract.failure.version).toBe(1);
  });
});
