import type { AccessSystem } from '../system.ts';

export type AccessExperienceOperations = Pick<
  AccessSystem['cells'],
  | 'acceptWorkforceInvitation'
  | 'beginMfaEnrollment'
  | 'completeMfaChallenge'
  | 'confirmMfaEnrollment'
  | 'getWorkforceMember'
  | 'grantWorkforceAccess'
  | 'issueWorkforceInvitation'
  | 'listActiveBusinessLocations'
  | 'listActiveProductionLocations'
  | 'listEffectiveAccessGrants'
  | 'listIdentitySessions'
  | 'listWorkforce'
  | 'listWorkforceInvitations'
  | 'listWorkforceMemberSessions'
  | 'listWorkforceSecurityEvents'
  | 'loadSession'
  | 'login'
  | 'previewWorkforceInvitation'
  | 'regenerateMfaRecoveryCodes'
  | 'reissueWorkforceInvitation'
  | 'removeMfa'
  | 'revokeIdentitySessions'
  | 'revokeSession'
  | 'revokeWorkforceAccess'
  | 'revokeWorkforceInvitation'
  | 'revokeWorkforceMemberSessions'
  | 'transitionWorkforceMembership'
>;

export type ProductionCapabilitiesForLocation =
  AccessSystem['productionCapabilitiesForLocation'];

export type { ActiveProductionLocation } from '../cells/scopes/list-active-production-locations/list-active-production-locations.model.ts';
