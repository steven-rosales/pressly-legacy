import type { AccessExecute } from "./auth/model/access.ts"
import type {
  ControlBrowserPresentation,
  ResolveControlAccess,
} from "./auth/model/ports.ts"
import type { ControlSessionDependencies } from "./auth/model/session.ts"
import type { ResolveControlIdentityAccess } from "./auth/model/cli-auth-api-session.ts"
import type {
  CustomerManagementExecute,
  OrderManagementExecute,
} from "./management/model/dependencies.ts"
import { resolveControlAccessCellDeclaration } from "./cells/access/resolve-access/cell.ts"
import { makeResolveControlAccessCell } from "./cells/access/resolve-access/execute.ts"
import { controlLoginCellDeclaration } from "./cells/auth/auth-login/cell.ts"
import { makeControlLoginCell } from "./cells/auth/auth-login/execute.ts"
import { controlCompleteMfaChallengeCellDeclaration } from "./cells/auth/complete-mfa-challenge/cell.ts"
import { makeControlCompleteMfaChallengeCell } from "./cells/auth/complete-mfa-challenge/execute.ts"
import { controlLoadSessionCellDeclaration } from "./cells/auth/load-auth-session/cell.ts"
import { makeControlLoadSessionCell } from "./cells/auth/load-auth-session/execute.ts"
import { controlLogoutCellDeclaration } from "./cells/auth/logout/cell.ts"
import { makeControlLogoutCell } from "./cells/auth/logout/execute.ts"
import { controlListIdentitySessionsCellDeclaration } from "./cells/auth/list-identity-sessions/cell.ts"
import { makeControlListIdentitySessionsCell } from "./cells/auth/list-identity-sessions/execute.ts"
import { controlRevokeAllIdentitySessionsCellDeclaration } from "./cells/auth/revoke-all-identity-sessions/cell.ts"
import { makeControlRevokeAllIdentitySessionsCell } from "./cells/auth/revoke-all-identity-sessions/execute.ts"
import { controlRevokeIdentitySessionCellDeclaration } from "./cells/auth/revoke-identity-session/cell.ts"
import { makeControlRevokeIdentitySessionCell } from "./cells/auth/revoke-identity-session/execute.ts"
import { controlBeginMfaEnrollmentCellDeclaration } from "./cells/auth/begin-mfa-enrollment/cell.ts"
import { makeControlBeginMfaEnrollmentCell } from "./cells/auth/begin-mfa-enrollment/execute.ts"
import { controlConfirmMfaEnrollmentCellDeclaration } from "./cells/auth/confirm-mfa-enrollment/cell.ts"
import { makeControlConfirmMfaEnrollmentCell } from "./cells/auth/confirm-mfa-enrollment/execute.ts"
import { controlRegenerateMfaRecoveryCodesCellDeclaration } from "./cells/auth/regenerate-mfa-recovery-codes/cell.ts"
import { makeControlRegenerateMfaRecoveryCodesCell } from "./cells/auth/regenerate-mfa-recovery-codes/execute.ts"
import { controlRemoveMfaCellDeclaration } from "./cells/auth/remove-mfa/cell.ts"
import { makeControlRemoveMfaCell } from "./cells/auth/remove-mfa/execute.ts"
import { controlCliAuthApiLoginCellDeclaration } from "./cells/cli-auth-api/auth-login/cell.ts"
import { makeControlCliAuthApiLoginCell } from "./cells/cli-auth-api/auth-login/execute.ts"
import { controlCliAuthApiCompleteMfaChallengeCellDeclaration } from "./cells/cli-auth-api/complete-mfa-challenge/cell.ts"
import { makeControlCliAuthApiCompleteMfaChallengeCell } from "./cells/cli-auth-api/complete-mfa-challenge/execute.ts"
import { controlCliAuthApiLoadSessionCellDeclaration } from "./cells/cli-auth-api/load-session/cell.ts"
import { makeControlCliAuthApiLoadSessionCell } from "./cells/cli-auth-api/load-session/execute.ts"
import { controlCliAuthApiLogoutCellDeclaration } from "./cells/cli-auth-api/logout/cell.ts"
import { makeControlCliAuthApiLogoutCell } from "./cells/cli-auth-api/logout/execute.ts"
import { controlCliAuthApiBeginMfaEnrollmentCellDeclaration } from "./cells/cli-auth-api/begin-mfa-enrollment/cell.ts"
import { makeControlCliAuthApiBeginMfaEnrollmentCell } from "./cells/cli-auth-api/begin-mfa-enrollment/execute.ts"
import { controlCliAuthApiConfirmMfaEnrollmentCellDeclaration } from "./cells/cli-auth-api/confirm-mfa-enrollment/cell.ts"
import { makeControlCliAuthApiConfirmMfaEnrollmentCell } from "./cells/cli-auth-api/confirm-mfa-enrollment/execute.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration } from "./cells/cli-auth-api/regenerate-mfa-recovery-codes/cell.ts"
import { makeControlCliAuthApiRegenerateMfaRecoveryCodesCell } from "./cells/cli-auth-api/regenerate-mfa-recovery-codes/execute.ts"
import { controlCliAuthApiRemoveMfaCellDeclaration } from "./cells/cli-auth-api/remove-mfa/cell.ts"
import { makeControlCliAuthApiRemoveMfaCell } from "./cells/cli-auth-api/remove-mfa/execute.ts"
import { listControlCustomersCellDeclaration } from "./cells/customers/list-customers/cell.ts"
import { makeListControlCustomersCell } from "./cells/customers/list-customers/execute.ts"
import { getControlCustomerCellDeclaration } from "./cells/customers/get-customer/cell.ts"
import { makeGetControlCustomerCell } from "./cells/customers/get-customer/execute.ts"
import { createControlCustomerCellDeclaration } from "./cells/customers/create-customer/cell.ts"
import { makeCreateControlCustomerCell } from "./cells/customers/create-customer/execute.ts"
import { updateControlCustomerCellDeclaration } from "./cells/customers/update-customer/cell.ts"
import { makeUpdateControlCustomerCell } from "./cells/customers/update-customer/execute.ts"
import { listControlOrdersCellDeclaration } from "./cells/orders/list-orders/cell.ts"
import { makeListControlOrdersCell } from "./cells/orders/list-orders/execute.ts"
import { getControlOrderCellDeclaration } from "./cells/orders/get-order/cell.ts"
import { makeGetControlOrderCell } from "./cells/orders/get-order/execute.ts"
import { createControlOrderCellDeclaration } from "./cells/orders/create-order/cell.ts"
import { makeCreateControlOrderCell } from "./cells/orders/create-order/execute.ts"
import { correctControlOrderCellDeclaration } from "./cells/orders/correct-order/cell.ts"
import { makeCorrectControlOrderCell } from "./cells/orders/correct-order/execute.ts"
import { listControlMembersCellDeclaration } from "./cells/workforce/list-members/cell.ts"
import { makeListControlMembersCell } from "./cells/workforce/list-members/execute.ts"
import { getControlMemberCellDeclaration } from "./cells/workforce/get-member/cell.ts"
import { makeGetControlMemberCell } from "./cells/workforce/get-member/execute.ts"
import { listControlMemberSessionsCellDeclaration } from "./cells/workforce/list-member-sessions/cell.ts"
import { makeListControlMemberSessionsCell } from "./cells/workforce/list-member-sessions/execute.ts"
import { revokeControlMemberSessionsCellDeclaration } from "./cells/workforce/revoke-member-sessions/cell.ts"
import { makeRevokeControlMemberSessionsCell } from "./cells/workforce/revoke-member-sessions/execute.ts"
import { listControlInvitationsCellDeclaration } from "./cells/workforce/list-invitations/cell.ts"
import { makeListControlInvitationsCell } from "./cells/workforce/list-invitations/execute.ts"
import { issueControlInvitationCellDeclaration } from "./cells/workforce/issue-invitation/cell.ts"
import { makeIssueControlInvitationCell } from "./cells/workforce/issue-invitation/execute.ts"
import { reissueControlInvitationCellDeclaration } from "./cells/workforce/reissue-invitation/cell.ts"
import { makeReissueControlInvitationCell } from "./cells/workforce/reissue-invitation/execute.ts"
import { revokeControlInvitationCellDeclaration } from "./cells/workforce/revoke-invitation/cell.ts"
import { makeRevokeControlInvitationCell } from "./cells/workforce/revoke-invitation/execute.ts"
import { suspendControlMembershipCellDeclaration } from "./cells/workforce/suspend-membership/cell.ts"
import { makeSuspendControlMembershipCell } from "./cells/workforce/suspend-membership/execute.ts"
import { reactivateControlMembershipCellDeclaration } from "./cells/workforce/reactivate-membership/cell.ts"
import { makeReactivateControlMembershipCell } from "./cells/workforce/reactivate-membership/execute.ts"
import { endControlMembershipCellDeclaration } from "./cells/workforce/end-membership/cell.ts"
import { makeEndControlMembershipCell } from "./cells/workforce/end-membership/execute.ts"
import { grantControlAccessCellDeclaration } from "./cells/workforce/grant-access/cell.ts"
import { makeGrantControlAccessCell } from "./cells/workforce/grant-access/execute.ts"
import { revokeControlAccessCellDeclaration } from "./cells/workforce/revoke-access/cell.ts"
import { makeRevokeControlAccessCell } from "./cells/workforce/revoke-access/execute.ts"
import { listControlSecurityEventsCellDeclaration } from "./cells/security/list-security-events/cell.ts"
import { makeListControlSecurityEventsCell } from "./cells/security/list-security-events/execute.ts"
import { previewControlInvitationCellDeclaration } from "./cells/invitations/preview-invitation/cell.ts"
import { makePreviewControlInvitationCell } from "./cells/invitations/preview-invitation/execute.ts"
import { acceptNewControlInvitationCellDeclaration } from "./cells/invitations/accept-new-invitation/cell.ts"
import { makeAcceptNewControlInvitationCell } from "./cells/invitations/accept-new-invitation/execute.ts"
import { acceptExistingControlInvitationCellDeclaration } from "./cells/invitations/accept-existing-invitation/cell.ts"
import { makeAcceptExistingControlInvitationCell } from "./cells/invitations/accept-existing-invitation/execute.ts"
import { acceptExistingPasswordCellDeclaration } from "./cells/invitations/accept-existing-invitation-password/cell.ts"
import { makeAcceptExistingPasswordCell } from "./cells/invitations/accept-existing-invitation-password/execute.ts"
import { acceptExistingMfaCellDeclaration } from "./cells/invitations/accept-existing-invitation-mfa/cell.ts"
import { makeAcceptExistingMfaCell } from "./cells/invitations/accept-existing-invitation-mfa/execute.ts"

export type ControlExperienceAccessCapabilities = Readonly<{
  login: AccessExecute<"login">
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  completeMfaChallenge: AccessExecute<"completeMfaChallenge">
  listIdentitySessions: AccessExecute<"listIdentitySessions">
  revokeIdentitySessions: AccessExecute<"revokeIdentitySessions">
  beginMfaEnrollment: AccessExecute<"beginMfaEnrollment">
  confirmMfaEnrollment: AccessExecute<"confirmMfaEnrollment">
  regenerateMfaRecoveryCodes: AccessExecute<"regenerateMfaRecoveryCodes">
  removeMfa: AccessExecute<"removeMfa">
  listEffectiveAccessGrants: AccessExecute<"listEffectiveAccessGrants">
  listActiveBusinessLocations: AccessExecute<"listActiveBusinessLocations">
  listWorkforce: AccessExecute<"listWorkforce">
  getWorkforceMember: AccessExecute<"getWorkforceMember">
  listWorkforceMemberSessions: AccessExecute<"listWorkforceMemberSessions">
  revokeWorkforceMemberSessions: AccessExecute<"revokeWorkforceMemberSessions">
  listWorkforceInvitations: AccessExecute<"listWorkforceInvitations">
  issueWorkforceInvitation: AccessExecute<"issueWorkforceInvitation">
  reissueWorkforceInvitation: AccessExecute<"reissueWorkforceInvitation">
  revokeWorkforceInvitation: AccessExecute<"revokeWorkforceInvitation">
  transitionWorkforceMembership: AccessExecute<"transitionWorkforceMembership">
  grantWorkforceAccess: AccessExecute<"grantWorkforceAccess">
  revokeWorkforceAccess: AccessExecute<"revokeWorkforceAccess">
  listWorkforceSecurityEvents: AccessExecute<"listWorkforceSecurityEvents">
  previewWorkforceInvitation: AccessExecute<"previewWorkforceInvitation">
  acceptWorkforceInvitation: AccessExecute<"acceptWorkforceInvitation">
}>

export type ControlCustomerManagementDependencies = Readonly<{
  listCustomers: CustomerManagementExecute<"listCustomers">
  getCustomer: CustomerManagementExecute<"getCustomer">
  createCustomer: CustomerManagementExecute<"createCustomer">
  updateCustomer: CustomerManagementExecute<"updateCustomer">
}>

export type ControlOrderManagementDependencies = Readonly<{
  listOrders: OrderManagementExecute<"listCanonicalOrders">
  getOrder: OrderManagementExecute<"getCanonicalOrder">
  createOrder: OrderManagementExecute<"createOrder">
  correctOrder: OrderManagementExecute<"correctOrder">
}>

export type ControlExperienceDependencies = Readonly<{
  access: ControlExperienceAccessCapabilities
  customers: ControlCustomerManagementDependencies
  orders: ControlOrderManagementDependencies
  presentation: ControlBrowserPresentation
  controlOrigin: string
  processorOrigin: string
}>

export const controlAuthCellDeclarations = Object.freeze({
  login: controlLoginCellDeclaration,
  completeMfaChallenge: controlCompleteMfaChallengeCellDeclaration,
  loadSession: controlLoadSessionCellDeclaration,
  logout: controlLogoutCellDeclaration,
  listIdentitySessions: controlListIdentitySessionsCellDeclaration,
  revokeAllIdentitySessions: controlRevokeAllIdentitySessionsCellDeclaration,
  revokeIdentitySession: controlRevokeIdentitySessionCellDeclaration,
  beginMfaEnrollment: controlBeginMfaEnrollmentCellDeclaration,
  confirmMfaEnrollment: controlConfirmMfaEnrollmentCellDeclaration,
  regenerateMfaRecoveryCodes: controlRegenerateMfaRecoveryCodesCellDeclaration,
  removeMfa: controlRemoveMfaCellDeclaration,
})

export const controlCliAuthApiCellDeclarations = Object.freeze({
  cliAuthApiLogin: controlCliAuthApiLoginCellDeclaration,
  cliAuthApiCompleteMfaChallenge:
    controlCliAuthApiCompleteMfaChallengeCellDeclaration,
  cliAuthApiLoadSession: controlCliAuthApiLoadSessionCellDeclaration,
  cliAuthApiLogout: controlCliAuthApiLogoutCellDeclaration,
  cliAuthApiBeginMfaEnrollment:
    controlCliAuthApiBeginMfaEnrollmentCellDeclaration,
  cliAuthApiConfirmMfaEnrollment:
    controlCliAuthApiConfirmMfaEnrollmentCellDeclaration,
  cliAuthApiRegenerateMfaRecoveryCodes:
    controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration,
  cliAuthApiRemoveMfa: controlCliAuthApiRemoveMfaCellDeclaration,
})

export const controlManagementCellDeclarations = Object.freeze({
  listCustomers: listControlCustomersCellDeclaration,
  getCustomer: getControlCustomerCellDeclaration,
  createCustomer: createControlCustomerCellDeclaration,
  updateCustomer: updateControlCustomerCellDeclaration,
  listOrders: listControlOrdersCellDeclaration,
  getOrder: getControlOrderCellDeclaration,
  createOrder: createControlOrderCellDeclaration,
  correctOrder: correctControlOrderCellDeclaration,
  listMembers: listControlMembersCellDeclaration,
  getMember: getControlMemberCellDeclaration,
  listMemberSessions: listControlMemberSessionsCellDeclaration,
  revokeMemberSessions: revokeControlMemberSessionsCellDeclaration,
  listInvitations: listControlInvitationsCellDeclaration,
  issueInvitation: issueControlInvitationCellDeclaration,
  reissueInvitation: reissueControlInvitationCellDeclaration,
  revokeInvitation: revokeControlInvitationCellDeclaration,
  suspendMembership: suspendControlMembershipCellDeclaration,
  reactivateMembership: reactivateControlMembershipCellDeclaration,
  endMembership: endControlMembershipCellDeclaration,
  grantAccess: grantControlAccessCellDeclaration,
  revokeAccess: revokeControlAccessCellDeclaration,
  listSecurityEvents: listControlSecurityEventsCellDeclaration,
  previewInvitation: previewControlInvitationCellDeclaration,
  acceptNewInvitation: acceptNewControlInvitationCellDeclaration,
  acceptExistingInvitation: acceptExistingControlInvitationCellDeclaration,
  acceptExistingInvitationPassword: acceptExistingPasswordCellDeclaration,
  acceptExistingInvitationMfa: acceptExistingMfaCellDeclaration,
})

export const controlCellDeclarations = Object.freeze({
  ...controlAuthCellDeclarations,
  ...controlCliAuthApiCellDeclarations,
  resolveAccess: resolveControlAccessCellDeclaration,
  ...controlManagementCellDeclarations,
})

export const makeControlExperience = (
  dependencies: ControlExperienceDependencies,
) => {
  const resolveAccess = makeResolveControlAccessCell({
    listEffectiveAccessGrants: dependencies.access.listEffectiveAccessGrants,
    listActiveBusinessLocations:
      dependencies.access.listActiveBusinessLocations,
    controlOrigin: dependencies.controlOrigin,
    processorOrigin: dependencies.processorOrigin,
  })
  const resolveControlIdentityAccess: ResolveControlIdentityAccess = async (
    input,
  ) => {
    const outcome = await resolveAccess.execute({
      identityId: input.identityId,
      ...(input.assuranceLevel === undefined
        ? {}
        : { assuranceLevel: input.assuranceLevel }),
    })
    if (outcome.kind === "failure") return outcome.failure
    return outcome.value
  }
  const resolveControlAccess: ResolveControlAccess = (loaded) =>
    resolveControlIdentityAccess({
      identityId: loaded.principal.identityId,
      ...(loaded.principalAttributes.assuranceLevel === undefined
        ? {}
        : { assuranceLevel: loaded.principalAttributes.assuranceLevel }),
    })
  const sessionDependencies: ControlSessionDependencies = {
    loadSession: dependencies.access.loadSession,
    revokeSession: dependencies.access.revokeSession,
    resolveAccess: resolveControlAccess,
    presentation: dependencies.presentation,
  }
  const cliAuthApiSessionDependencies = {
    loadSession: dependencies.access.loadSession,
    revokeSession: dependencies.access.revokeSession,
    resolveIdentityAccess: resolveControlIdentityAccess,
  }
  const invitationDependencies = {
    previewInvitation: dependencies.access.previewWorkforceInvitation,
    acceptInvitation: dependencies.access.acceptWorkforceInvitation,
    login: dependencies.access.login,
    completeMfaChallenge: dependencies.access.completeMfaChallenge,
    ...sessionDependencies,
    controlOrigin: dependencies.controlOrigin,
    processorOrigin: dependencies.processorOrigin,
  }

  return Object.freeze({
    cells: Object.freeze({
      login: makeControlLoginCell({
        ...sessionDependencies,
        login: dependencies.access.login,
      }),
      completeMfaChallenge: makeControlCompleteMfaChallengeCell({
        ...sessionDependencies,
        completeMfaChallenge: dependencies.access.completeMfaChallenge,
      }),
      loadSession: makeControlLoadSessionCell(sessionDependencies),
      logout: makeControlLogoutCell(sessionDependencies),
      listIdentitySessions: makeControlListIdentitySessionsCell(
        dependencies.access.listIdentitySessions,
      ),
      revokeAllIdentitySessions: makeControlRevokeAllIdentitySessionsCell(
        dependencies.access.revokeIdentitySessions,
      ),
      revokeIdentitySession: makeControlRevokeIdentitySessionCell(
        dependencies.access.revokeIdentitySessions,
      ),
      beginMfaEnrollment: makeControlBeginMfaEnrollmentCell(
        dependencies.access.beginMfaEnrollment,
      ),
      confirmMfaEnrollment: makeControlConfirmMfaEnrollmentCell(
        dependencies.access.confirmMfaEnrollment,
      ),
      regenerateMfaRecoveryCodes: makeControlRegenerateMfaRecoveryCodesCell(
        dependencies.access.regenerateMfaRecoveryCodes,
      ),
      removeMfa: makeControlRemoveMfaCell(dependencies.access.removeMfa),
      cliAuthApiLogin: makeControlCliAuthApiLoginCell({
        ...cliAuthApiSessionDependencies,
        login: dependencies.access.login,
      }),
      cliAuthApiCompleteMfaChallenge:
        makeControlCliAuthApiCompleteMfaChallengeCell({
          ...cliAuthApiSessionDependencies,
          completeMfaChallenge: dependencies.access.completeMfaChallenge,
        }),
      cliAuthApiLoadSession: makeControlCliAuthApiLoadSessionCell(
        cliAuthApiSessionDependencies,
      ),
      cliAuthApiLogout: makeControlCliAuthApiLogoutCell(
        dependencies.access.revokeSession,
      ),
      cliAuthApiBeginMfaEnrollment: makeControlCliAuthApiBeginMfaEnrollmentCell(
        dependencies.access.beginMfaEnrollment,
      ),
      cliAuthApiConfirmMfaEnrollment:
        makeControlCliAuthApiConfirmMfaEnrollmentCell(
          dependencies.access.confirmMfaEnrollment,
        ),
      cliAuthApiRegenerateMfaRecoveryCodes:
        makeControlCliAuthApiRegenerateMfaRecoveryCodesCell(
          dependencies.access.regenerateMfaRecoveryCodes,
        ),
      cliAuthApiRemoveMfa: makeControlCliAuthApiRemoveMfaCell(
        dependencies.access.removeMfa,
      ),
      resolveAccess,
      listCustomers: makeListControlCustomersCell(
        dependencies.customers.listCustomers,
      ),
      getCustomer: makeGetControlCustomerCell(
        dependencies.customers.getCustomer,
      ),
      createCustomer: makeCreateControlCustomerCell(
        dependencies.customers.createCustomer,
      ),
      updateCustomer: makeUpdateControlCustomerCell(
        dependencies.customers.updateCustomer,
      ),
      listOrders: makeListControlOrdersCell(dependencies.orders.listOrders),
      getOrder: makeGetControlOrderCell(dependencies.orders.getOrder),
      createOrder: makeCreateControlOrderCell(dependencies.orders.createOrder),
      correctOrder: makeCorrectControlOrderCell({
        getOrder: dependencies.orders.getOrder,
        correctOrder: dependencies.orders.correctOrder,
      }),
      listMembers: makeListControlMembersCell(
        dependencies.access.listWorkforce,
      ),
      getMember: makeGetControlMemberCell(
        dependencies.access.getWorkforceMember,
      ),
      listMemberSessions: makeListControlMemberSessionsCell(
        dependencies.access.listWorkforceMemberSessions,
      ),
      revokeMemberSessions: makeRevokeControlMemberSessionsCell(
        dependencies.access.revokeWorkforceMemberSessions,
      ),
      listInvitations: makeListControlInvitationsCell(
        dependencies.access.listWorkforceInvitations,
      ),
      issueInvitation: makeIssueControlInvitationCell(
        dependencies.access.issueWorkforceInvitation,
      ),
      reissueInvitation: makeReissueControlInvitationCell(
        dependencies.access.reissueWorkforceInvitation,
      ),
      revokeInvitation: makeRevokeControlInvitationCell(
        dependencies.access.revokeWorkforceInvitation,
      ),
      suspendMembership: makeSuspendControlMembershipCell(
        dependencies.access.transitionWorkforceMembership,
      ),
      reactivateMembership: makeReactivateControlMembershipCell(
        dependencies.access.transitionWorkforceMembership,
      ),
      endMembership: makeEndControlMembershipCell(
        dependencies.access.transitionWorkforceMembership,
      ),
      grantAccess: makeGrantControlAccessCell(
        dependencies.access.grantWorkforceAccess,
      ),
      revokeAccess: makeRevokeControlAccessCell(
        dependencies.access.revokeWorkforceAccess,
      ),
      listSecurityEvents: makeListControlSecurityEventsCell(
        dependencies.access.listWorkforceSecurityEvents,
      ),
      previewInvitation: makePreviewControlInvitationCell(
        dependencies.access.previewWorkforceInvitation,
      ),
      acceptNewInvitation: makeAcceptNewControlInvitationCell(
        dependencies.access.acceptWorkforceInvitation,
      ),
      acceptExistingInvitation: makeAcceptExistingControlInvitationCell(
        dependencies.access.acceptWorkforceInvitation,
      ),
      acceptExistingInvitationPassword: makeAcceptExistingPasswordCell(
        invitationDependencies,
      ),
      acceptExistingInvitationMfa: makeAcceptExistingMfaCell(
        invitationDependencies,
      ),
    }),
  })
}

export type ControlExperience = ReturnType<typeof makeControlExperience>
