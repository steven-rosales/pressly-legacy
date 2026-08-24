import type { PostgresDatabase } from '@pressly/postgres/client';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import { accessTestSchema } from '../../../testing/schema.ts';
import { makePostgresBootstrapOwner } from './postgres.ts';

describe('PostgreSQL bootstrap-owner assembly', () => {
  it('preserves Access-owned password-hash failure semantics before storage', async () => {
    const cause = unexpectedError({
      code: 'synthetic_password_hash_failure',
      message: 'Synthetic password hash failure.',
    });
    const bootstrapOwner = makePostgresBootstrapOwner(
      {} as PostgresDatabase,
      accessTestSchema,
      { hashPassword: async () => Promise.reject(cause) },
    );

    await expect(
      bootstrapOwner({
        businessId: '00000000-0000-4000-8000-000000000100',
        businessSlug: 'pressly-one',
        businessDisplayName: 'Pressly One',
        email: 'owner@example.com',
        password: 'StrongAccessPassword123!',
        confirmation: 'bootstrap-first-owner',
      }),
    ).rejects.toMatchObject({
      code: 'password_hashing_failed',
      message: 'Password hashing failed.',
      safeMessage: 'Password could not be saved.',
      cause,
    });
  });
});
