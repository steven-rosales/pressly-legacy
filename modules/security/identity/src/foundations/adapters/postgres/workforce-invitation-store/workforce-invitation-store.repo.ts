import type { Database } from '@pressly/db/client';
import { makeWorkforceInvitationAcceptanceStore } from './workforce-invitation-acceptance.repo.ts';
import { makeWorkforceInvitationAdministrationStore } from './workforce-invitation-administration.repo.ts';
import { makeWorkforceInvitationQueryStore } from './workforce-invitation-query.repo.ts';
import type { WorkforceInvitationStore } from '../../../ports/workforce-invitation-store/workforce-invitation-store.port.ts';

export const makeWorkforceInvitationStore = (
  db: Database,
): WorkforceInvitationStore => ({
  ...makeWorkforceInvitationAdministrationStore(db),
  ...makeWorkforceInvitationAcceptanceStore(db),
  ...makeWorkforceInvitationQueryStore(db),
});
