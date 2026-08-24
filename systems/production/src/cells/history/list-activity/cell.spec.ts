import { describe, expect, it, vi } from 'vitest';
import {
  listHistoryActivityCellDeclaration,
  makeListHistoryActivityCell,
} from './cell.ts';
import { listHistoryActivityContract } from './contract.ts';
import type { ListHistoryActivityRepository } from './types.ts';

describe('production.list-history-activity.v1 cell', () => {
  it('declares an authenticated, headless, read-only system capability', () => {
    expect(listHistoryActivityCellDeclaration).toMatchObject({
      id: 'production.list-history-activity.v1',
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
      observability: { operation: 'production.list_history_activity' },
    });
    expect(listHistoryActivityCellDeclaration.contract).toBe(
      listHistoryActivityContract,
    );
    expect(
      listHistoryActivityCellDeclaration.authorization?.timing === 'after-input'
        ? listHistoryActivityCellDeclaration.authorization.scope({
            locationId: 'location-1',
            limit: 50,
          })
        : null,
    ).toBe('location-1');
  });

  it('binds only the activity repository and clock', async () => {
    const asOf = new Date('2026-08-21T15:00:00.000Z');
    const list = vi.fn<ListHistoryActivityRepository['list']>(async () => ({
      kind: 'found',
      page: { items: [], nextCursor: null, asOf },
    }));
    const cell = makeListHistoryActivityCell({
      repo: { list },
      clock: { now: () => asOf },
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
