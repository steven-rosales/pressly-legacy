import type { AccessExecute } from './auth/model/access.ts';
import {
  customerBeginMfaEnrollmentCellDeclaration,
  makeCustomerBeginMfaEnrollmentCell,
} from './cells/auth/begin-mfa-enrollment/cell.ts';
import {
  customerCompleteMfaChallengeCellDeclaration,
  makeCustomerCompleteMfaChallengeCell,
} from './cells/auth/complete-mfa-challenge/cell.ts';
import {
  customerConfirmMfaEnrollmentCellDeclaration,
  makeCustomerConfirmMfaEnrollmentCell,
} from './cells/auth/confirm-mfa-enrollment/cell.ts';
import {
  customerListIdentitySessionsCellDeclaration,
  makeCustomerListIdentitySessionsCell,
} from './cells/auth/list-identity-sessions/cell.ts';
import {
  customerLoadSessionCellDeclaration,
  makeCustomerLoadSessionCell,
} from './cells/auth/load-session/cell.ts';
import {
  customerLoginCellDeclaration,
  makeCustomerLoginCell,
} from './cells/auth/login/cell.ts';
import {
  customerLogoutCellDeclaration,
  makeCustomerLogoutCell,
} from './cells/auth/logout/cell.ts';
import {
  customerRegenerateMfaRecoveryCodesCellDeclaration,
  makeCustomerRegenerateMfaRecoveryCodesCell,
} from './cells/auth/regenerate-mfa-recovery-codes/cell.ts';
import {
  customerRemoveMfaCellDeclaration,
  makeCustomerRemoveMfaCell,
} from './cells/auth/remove-mfa/cell.ts';
import {
  customerRevokeAllIdentitySessionsCellDeclaration,
  makeCustomerRevokeAllIdentitySessionsCell,
} from './cells/auth/revoke-all-identity-sessions/cell.ts';
import {
  customerRevokeIdentitySessionCellDeclaration,
  makeCustomerRevokeIdentitySessionCell,
} from './cells/auth/revoke-identity-session/cell.ts';

export type CustomerExperienceDependencies = Readonly<{
  login: AccessExecute<'login'>;
  loadSession: AccessExecute<'loadSession'>;
  revokeSession: AccessExecute<'revokeSession'>;
  completeMfaChallenge: AccessExecute<'completeMfaChallenge'>;
  listIdentitySessions: AccessExecute<'listIdentitySessions'>;
  revokeIdentitySessions: AccessExecute<'revokeIdentitySessions'>;
  beginMfaEnrollment: AccessExecute<'beginMfaEnrollment'>;
  confirmMfaEnrollment: AccessExecute<'confirmMfaEnrollment'>;
  regenerateMfaRecoveryCodes: AccessExecute<'regenerateMfaRecoveryCodes'>;
  removeMfa: AccessExecute<'removeMfa'>;
}>;

export const customerAuthCellDeclarations = Object.freeze({
  login: customerLoginCellDeclaration,
  loadSession: customerLoadSessionCellDeclaration,
  logout: customerLogoutCellDeclaration,
  completeMfaChallenge: customerCompleteMfaChallengeCellDeclaration,
  listIdentitySessions: customerListIdentitySessionsCellDeclaration,
  revokeAllIdentitySessions: customerRevokeAllIdentitySessionsCellDeclaration,
  revokeIdentitySession: customerRevokeIdentitySessionCellDeclaration,
  beginMfaEnrollment: customerBeginMfaEnrollmentCellDeclaration,
  confirmMfaEnrollment: customerConfirmMfaEnrollmentCellDeclaration,
  regenerateMfaRecoveryCodes: customerRegenerateMfaRecoveryCodesCellDeclaration,
  removeMfa: customerRemoveMfaCellDeclaration,
});

export const makeCustomerExperience = (
  dependencies: CustomerExperienceDependencies,
) =>
  Object.freeze({
    cells: Object.freeze({
      login: makeCustomerLoginCell({
        login: dependencies.login,
        revokeSession: dependencies.revokeSession,
      }),
      loadSession: makeCustomerLoadSessionCell(dependencies.loadSession),
      logout: makeCustomerLogoutCell(dependencies.revokeSession),
      completeMfaChallenge: makeCustomerCompleteMfaChallengeCell({
        completeMfaChallenge: dependencies.completeMfaChallenge,
        revokeSession: dependencies.revokeSession,
      }),
      listIdentitySessions: makeCustomerListIdentitySessionsCell(
        dependencies.listIdentitySessions,
      ),
      revokeAllIdentitySessions: makeCustomerRevokeAllIdentitySessionsCell(
        dependencies.revokeIdentitySessions,
      ),
      revokeIdentitySession: makeCustomerRevokeIdentitySessionCell(
        dependencies.revokeIdentitySessions,
      ),
      beginMfaEnrollment: makeCustomerBeginMfaEnrollmentCell(
        dependencies.beginMfaEnrollment,
      ),
      confirmMfaEnrollment: makeCustomerConfirmMfaEnrollmentCell(
        dependencies.confirmMfaEnrollment,
      ),
      regenerateMfaRecoveryCodes: makeCustomerRegenerateMfaRecoveryCodesCell(
        dependencies.regenerateMfaRecoveryCodes,
      ),
      removeMfa: makeCustomerRemoveMfaCell(dependencies.removeMfa),
    }),
  });

export type CustomerExperience = ReturnType<typeof makeCustomerExperience>;
