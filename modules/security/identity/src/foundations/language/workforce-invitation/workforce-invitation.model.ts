import type { WorkforceRole } from '../workforce/workforce.model.ts';
import type { WorkforceInvitationEntity } from './workforce-invitation.entity.ts';

export type WorkforceInvitationSummary = WorkforceInvitationEntity;

export type WorkforceInvitationPreview = Readonly<{
  invitationId: string;
  businessId: string;
  businessName: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  expiresAt: Date;
  existingIdentity: boolean;
}>;
