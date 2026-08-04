import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { resolveCanonicalSourceUserFailure } from '../../../../src/features/sources/resolve-canonical-source-user/resolve-canonical-source-user.failure.ts';
import type { ResolveCanonicalSourceUserCommand } from '../../../../src/features/sources/resolve-canonical-source-user/resolve-canonical-source-user.model.ts';
import { makeResolveCanonicalSourceUser } from '../../../../src/features/sources/resolve-canonical-source-user/resolve-canonical-source-user.usecase.ts';

const command: ResolveCanonicalSourceUserCommand = {
  businessId: '00000000-0000-4000-8000-000000000100',
  source: 'cents',
  externalUserId: 'customer-1',
  profile: {
    firstName: 'Ada',
    lastName: null,
    businessName: null,
    phone: null,
    email: null,
  },
  revision: {
    at: new Date('2026-07-21T12:00:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'cents-v1',
    observedAt: new Date('2026-07-21T12:00:00.000Z'),
    normalizedPayload: {},
  },
  idempotencyKey: 'source-user-1',
  context: {
    origin: 'cents_webhook',
    principal: { kind: 'system', id: 'cents' },
  },
  now: new Date('2026-07-21T12:00:00.000Z'),
};

describe('resolve canonical source User', () => {
  it('keeps an expected business conflict as typed feature data', async () => {
    const resolve = makeResolveCanonicalSourceUser({
      resolveOrCreate: vi.fn(async () =>
        result.err(resolveCanonicalSourceUserFailure.businessConflict()),
      ),
    });

    await expect(resolve(command)).resolves.toEqual({
      tag: 'err',
      error: {
        kind: 'conflict',
        code: 'canonical_source_user_business_conflict',
      },
    });
  });

  it('throws unexpected persistence failures as an AppError', async () => {
    const resolve = makeResolveCanonicalSourceUser({
      resolveOrCreate: vi.fn(async () => {
        throw new Error('connection lost');
      }),
    });

    await expect(resolve(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'canonical_source_user_resolution_failed',
      status: 503,
    });
  });
});
