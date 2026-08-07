import { describe, expect, it, vi } from 'vitest';
import { makeListUsers } from '../../../../src/features/users/list-users/list-users.usecase.ts';
import {
  decodeUserCursor,
  encodeUserCursor,
} from '../../../../src/features/users/list-users/user-pagination.policy.ts';

const businessId = '00000000-0000-4000-8000-000000000100';

describe('read Users', () => {
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

  it('returns a repository-rejected cursor as typed validation data', async () => {
    const list = makeListUsers(
      vi.fn(async () => ({ kind: 'invalid_cursor' as const })),
    );

    await expect(
      list({
        businessId,
        query: null,
        active: null,
        limit: 50,
        cursor: 'opaque-but-invalid',
      }),
    ).resolves.toEqual({
      tag: 'err',
      error: { kind: 'validation', code: 'user_cursor_invalid' },
    });
  });
});
