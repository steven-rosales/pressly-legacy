import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { loadBoardCellDeclaration, makeLoadBoardCell } from './cell.ts';
import { loadBoardContract } from './contract.ts';
import type { LoadBoardRepository } from './types.ts';

describe('production.load-board.v1 cell', () => {
  it('declares an authenticated, headless, read-only system capability', () => {
    expect(loadBoardCellDeclaration).toMatchObject({
      id: 'production.load-board.v1',
      kind: 'query',
      authentication: 'required',
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'none' },
      idempotency: { required: false },
      surfaces: [],
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.load_board' },
    });
    expect(loadBoardCellDeclaration.contract).toBe(loadBoardContract);
    expect(
      loadBoardCellDeclaration.authorization?.timing === 'after-input'
        ? loadBoardCellDeclaration.authorization.scope({
            locationId: 'location-1',
            productionRunId: '32000000-0000-4000-8000-000000000002',
          })
        : null,
    ).toBe('location-1');
  });

  it('binds only the repository, clock, and canonical policy', async () => {
    const load = vi.fn<LoadBoardRepository['load']>(async () => null);
    const cell = makeLoadBoardCell({
      repo: { load },
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
      policy: productionRules,
    });

    await expect(
      cell.execute({
        locationId: 'location-1',
        productionRunId: '32000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_board_not_found' },
    });
    expect(load).toHaveBeenCalledOnce();
  });
});
