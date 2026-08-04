import type { Database } from '@pressly/db/client';
import { makeWorkforceMemberSessionStore } from './workforce-member-session.repo.ts';
import { makeWorkforceSecurityEventStore } from './workforce-security-event.repo.ts';
import type { WorkforceSecurityStore } from '../../../ports/workforce-security-store/workforce-security-store.port.ts';

export const makeWorkforceSecurityStore = (
  db: Database,
): WorkforceSecurityStore => ({
  ...makeWorkforceMemberSessionStore(db),
  ...makeWorkforceSecurityEventStore(db),
});
