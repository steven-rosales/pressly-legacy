import { describe, expect, it, vi } from 'vitest';
import {
  decodeUserCursor,
  encodeUserCursor,
} from '../src/read-users/user-pagination.policy.ts';
import { makeListUsers } from '../src/read-users/read-users.usecase.ts';

const businessId = '00000000-0000-4000-8000-000000000100';

describe('customer read boundary', () => {
  it('binds opaque cursors to the selected business and filters', () => {
    const cursor = encodeUserCursor(
      { businessId, query: 'Ada', active: true },
      {
        createdAt: new Date('2026-07-29T12:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000010',
      },
    );
    expect(
      decodeUserCursor({ businessId, query: 'ada', active: true }, cursor),
    ).not.toBeNull();
    expect(
      decodeUserCursor(
        {
          businessId: '00000000-0000-4000-8000-000000000200',
          query: 'ada',
          active: true,
        },
        cursor,
      ),
    ).toBeNull();
  });

  it('returns a safe validation error for a repository-rejected cursor', async () => {
    const list = makeListUsers({
      list: vi.fn(async () => ({ kind: 'invalid_cursor' as const })),
      get: vi.fn(),
    });
    await expect(
      list({
        businessId,
        query: null,
        active: null,
        limit: 50,
        cursor: 'opaque-but-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'user_cursor_invalid', status: 400 },
    });
  });
});
