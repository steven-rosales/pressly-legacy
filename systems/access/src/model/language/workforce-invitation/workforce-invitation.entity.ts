import type { WorkforceRole } from '../workforce/workforce.model.ts';
import type { WorkforceInvitationState } from './workforce-invitation.lifecycle.ts';

export type WorkforceInvitationEntity = Readonly<{
  id: string;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  state: WorkforceInvitationState;
  version: number;
  expiresAt: Date;
  createdAt: Date;
}>;
