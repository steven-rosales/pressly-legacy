import type { WorkforceRole } from '../../../../model/language/workforce/workforce.model.ts';

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
