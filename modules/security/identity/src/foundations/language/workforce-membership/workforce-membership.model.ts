import type { AccessGrantSummary } from '../access-grant/access-grant.model.ts';
import type { WorkforceMembershipEntity } from './workforce-membership.entity.ts';

export type WorkforceMemberSummary = WorkforceMembershipEntity &
  Readonly<{
    displayName: string;
    email: string;
    mfaEnabled: boolean;
    grants: readonly AccessGrantSummary[];
  }>;

export type WorkforceMemberDetail = WorkforceMemberSummary &
  Readonly<{
    activeSessionCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type WorkforcePage = Readonly<{
  members: readonly WorkforceMemberSummary[];
  nextCursor: string | null;
}>;
