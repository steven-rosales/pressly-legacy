import { describe, expect, it, vi } from 'vitest';
import {
  listHistoryPlansCellDeclaration,
  makeListHistoryPlansCell,
} from './cell.ts';
import { listHistoryPlansContract } from './contract.ts';
import type { ListHistoryPlansRepository } from './types.ts';

describe('production.list-history-plans.v1 cell', () => {
  it('declares exact ownership, authorization, consistency, and observability', () => {
    expect(listHistoryPlansCellDeclaration).toMatchObject({
      id: 'production.list-history-plans.v1',
      kind: 'query',
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'none' },
      idempotency: { required: false },
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.list_history_plans' },
    });
    expect(listHistoryPlansCellDeclaration.contract).toBe(
      listHistoryPlansContract,
    );
    expect(
      listHistoryPlansCellDeclaration.authorization?.timing === 'after-input'
        ? listHistoryPlansCellDeclaration.authorization.scope({
            locationId: 'location-1',
            limit: 50,
          })
        : null,
    ).toBe('location-1');
  });

  it('binds only the explicit repository and clock dependencies', async () => {
    const list = vi.fn<ListHistoryPlansRepository['list']>(async () => ({
      kind: 'found',
      page: {
        items: [],
        nextCursor: null,
        asOf: new Date('2026-08-21T15:00:00.000Z'),
      },
    }));
    const cell = makeListHistoryPlansCell({
      repo: { list },
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
    });

    await expect(
      cell.execute({ locationId: 'location-1', limit: 50 }),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        items: [],
        nextCursor: null,
        asOf: '2026-08-21T15:00:00.000Z',
      },
    });
    expect(list).toHaveBeenCalledOnce();
  });
});
