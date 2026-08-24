import { bootstrapOwnerCellDeclaration } from '../cells/bootstrap/bootstrap-owner/cell.ts';
import { beginMfaEnrollmentCellDeclaration } from '../cells/mfa/begin-mfa-enrollment/cell.ts';
import { completeMfaChallengeCellDeclaration } from '../cells/mfa/complete-mfa-challenge/cell.ts';
import { confirmMfaEnrollmentCellDeclaration } from '../cells/mfa/confirm-mfa-enrollment/cell.ts';
import { regenerateMfaRecoveryCodesCellDeclaration } from '../cells/mfa/regenerate-mfa-recovery-codes/cell.ts';
import { removeMfaCellDeclaration } from '../cells/mfa/remove-mfa/cell.ts';
import { listActiveBusinessLocationsCellDeclaration } from '../cells/scopes/list-active-business-locations/cell.ts';
import { listActiveProductionLocationsCellDeclaration } from '../cells/scopes/list-active-production-locations/cell.ts';
import { listEffectiveAccessGrantsCellDeclaration } from '../cells/scopes/list-effective-access-grants/cell.ts';
import { resolveLocationAncestryCellDeclaration } from '../cells/scopes/resolve-location-ancestry/cell.ts';
import { resolveProductionVisibilityCellDeclaration } from '../cells/scopes/resolve-production-visibility/cell.ts';
import { reconcileProductionLocationCellDeclaration } from '../cells/scopes/reconcile-production-location/cell.ts';
import { listIdentitySessionsCellDeclaration } from '../cells/sessions/list-identity-sessions/cell.ts';
import { loadSessionCellDeclaration } from '../cells/sessions/load-session/cell.ts';
import { loginCellDeclaration } from '../cells/sessions/login/cell.ts';
import { revokeIdentitySessionsCellDeclaration } from '../cells/sessions/revoke-identity-sessions/cell.ts';
import { revokeSessionCellDeclaration } from '../cells/sessions/revoke-session/cell.ts';
import { grantWorkforceAccessCellDeclaration } from '../cells/workforce/access/grant-workforce-access/cell.ts';
import { revokeWorkforceAccessCellDeclaration } from '../cells/workforce/access/revoke-workforce-access/cell.ts';
import { acceptWorkforceInvitationCellDeclaration } from '../cells/workforce/invitations/accept-workforce-invitation/cell.ts';
import { issueWorkforceInvitationCellDeclaration } from '../cells/workforce/invitations/issue-workforce-invitation/cell.ts';
import { listWorkforceInvitationsCellDeclaration } from '../cells/workforce/invitations/list-workforce-invitations/cell.ts';
import { previewWorkforceInvitationCellDeclaration } from '../cells/workforce/invitations/preview-workforce-invitation/cell.ts';
import { reissueWorkforceInvitationCellDeclaration } from '../cells/workforce/invitations/reissue-workforce-invitation/cell.ts';
import { revokeWorkforceInvitationCellDeclaration } from '../cells/workforce/invitations/revoke-workforce-invitation/cell.ts';
import { getWorkforceMemberCellDeclaration } from '../cells/workforce/memberships/get-workforce-member/cell.ts';
import { listWorkforceCellDeclaration } from '../cells/workforce/memberships/list-workforce/cell.ts';
import { transitionWorkforceMembershipCellDeclaration } from '../cells/workforce/memberships/transition-workforce-membership/cell.ts';
import { listWorkforceMemberSessionsCellDeclaration } from '../cells/workforce/security/list-workforce-member-sessions/cell.ts';
import { listWorkforceSecurityEventsCellDeclaration } from '../cells/workforce/security/list-workforce-security-events/cell.ts';
import { revokeWorkforceMemberSessionsCellDeclaration } from '../cells/workforce/security/revoke-workforce-member-sessions/cell.ts';

export type AccessOperationKind = 'command' | 'query';

export type AccessOperationContract = Readonly<{
  id: string;
  kind: AccessOperationKind;
}>;

export const accessCellDeclarations = Object.freeze([
  bootstrapOwnerCellDeclaration,
  beginMfaEnrollmentCellDeclaration,
  completeMfaChallengeCellDeclaration,
  confirmMfaEnrollmentCellDeclaration,
  regenerateMfaRecoveryCodesCellDeclaration,
  removeMfaCellDeclaration,
  listActiveBusinessLocationsCellDeclaration,
  listActiveProductionLocationsCellDeclaration,
  listEffectiveAccessGrantsCellDeclaration,
  reconcileProductionLocationCellDeclaration,
  resolveLocationAncestryCellDeclaration,
  resolveProductionVisibilityCellDeclaration,
  listIdentitySessionsCellDeclaration,
  loadSessionCellDeclaration,
  loginCellDeclaration,
  revokeIdentitySessionsCellDeclaration,
  revokeSessionCellDeclaration,
  grantWorkforceAccessCellDeclaration,
  revokeWorkforceAccessCellDeclaration,
  acceptWorkforceInvitationCellDeclaration,
  issueWorkforceInvitationCellDeclaration,
  listWorkforceInvitationsCellDeclaration,
  previewWorkforceInvitationCellDeclaration,
  reissueWorkforceInvitationCellDeclaration,
  revokeWorkforceInvitationCellDeclaration,
  getWorkforceMemberCellDeclaration,
  listWorkforceCellDeclaration,
  transitionWorkforceMembershipCellDeclaration,
  listWorkforceMemberSessionsCellDeclaration,
  listWorkforceSecurityEventsCellDeclaration,
  revokeWorkforceMemberSessionsCellDeclaration,
] as const);

/** Derived only from the canonical cell declarations; never hand-maintained. */
export const accessOperationContractV2 = Object.freeze(
  accessCellDeclarations.map(({ id, kind }) => Object.freeze({ id, kind })),
);

export type AccessOperationId = (typeof accessCellDeclarations)[number]['id'];
