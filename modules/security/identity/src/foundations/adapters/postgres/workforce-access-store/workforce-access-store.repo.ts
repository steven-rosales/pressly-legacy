import type { Database } from '@pressly/db/client';
import { makeWorkforceAccessGrantStore } from './grant-workforce-access.repo.ts';
import { makeWorkforceAccessRevokeStore } from './revoke-workforce-access.repo.ts';
import type { AccessGrantStore } from '../../../ports/workforce-access-store/workforce-access-store.port.ts';

export const makeWorkforceAccessStore = (db: Database): AccessGrantStore => ({
  ...makeWorkforceAccessGrantStore(db),
  ...makeWorkforceAccessRevokeStore(db),
});
