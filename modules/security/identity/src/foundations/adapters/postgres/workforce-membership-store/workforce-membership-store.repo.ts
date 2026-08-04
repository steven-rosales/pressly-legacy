import type { Database } from '@pressly/db/client';
import { makeWorkforceMembershipQueryStore } from './workforce-membership-query.repo.ts';
import { makeWorkforceMembershipTransitionStore } from './workforce-membership-transition.repo.ts';
import type { WorkforceMembershipStore } from '../../../ports/workforce-membership-store/workforce-membership-store.port.ts';

export const makeWorkforceMembershipStore = (
  db: Database,
): WorkforceMembershipStore => ({
  ...makeWorkforceMembershipQueryStore(db),
  ...makeWorkforceMembershipTransitionStore(db),
});
