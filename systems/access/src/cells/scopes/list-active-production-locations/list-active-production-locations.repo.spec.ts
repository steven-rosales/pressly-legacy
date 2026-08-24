import type { PostgresDatabase } from '@pressly/postgres/client';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { accessTestSchema } from '../../../testing/schema.ts';
import { makeListActiveProductionLocationsStore } from './list-active-production-locations.repo.ts';

describe('active production location persistence', () => {
  it('preserves centralized legacy normalization for an unknown database failure', async () => {
    const cause = Object.freeze({ message: 'connection closed' });
    const database = {
      select: () => {
        throw cause;
      },
    } as unknown as PostgresDatabase;
    const store = makeListActiveProductionLocationsStore(
      database,
      accessTestSchema,
    );
    const legacyPublicFailure = normalizeUnknownError(cause);

    await expect(store.listActiveLocations()).rejects.toMatchObject({
      code: legacyPublicFailure.code,
      safeMessage: legacyPublicFailure.safeMessage,
      status: legacyPublicFailure.status,
      cause,
    });
  });
});
