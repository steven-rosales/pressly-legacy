import type { WorkforceMembershipState } from './workforce-membership.lifecycle.ts';

export type WorkforceMembershipEntity = Readonly<{
  membershipId: string;
  businessId: string;
  identityId: string;
  state: WorkforceMembershipState;
  version: number;
  startedAt: Date;
  suspendedAt: Date | null;
  endedAt: Date | null;
}>;
