import { expect } from "vitest"
import { makeControlExperience } from "../../src/control-experience.ts"
import { makeAdminCliExperience } from "../../src/cli/admin-cli.ts"
import type { ControlManagementContext } from "../../src/management/model/context.ts"

const now = new Date("2026-08-22T20:00:00.000Z")
const expiresAt = new Date("2026-08-23T20:00:00.000Z")
const businessId = "11111111-1111-4111-8111-111111111111"
const identityId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const membershipId = "44444444-4444-4444-8444-444444444444"
const customerId = "55555555-5555-4555-8555-555555555555"
const orderId = "66666666-6666-4666-8666-666666666666"
const fulfillmentId = "77777777-7777-4777-8777-777777777777"
const invitationId = "88888888-8888-4888-8888-888888888888"
const grantId = "99999999-9999-4999-8999-999999999999"

const success = <Value>(value: Value) =>
  Object.freeze({ kind: "success" as const, value })

const context: ControlManagementContext = {
  access: {
    business: { id: businessId, name: "Pressly Laundry" },
    locations: [{ id: "east", name: "East", timezone: "America/New_York" }],
    selectedLocationId: "east",
    capabilities: [
      "control:view",
      "team:read",
      "team:write",
      "customers:read",
      "customers:write",
      "orders:read",
      "orders:write",
      "security:read",
      "security:write",
      "processor:view",
    ],
    applications: [],
  },
  actor: { identityId, sessionId },
  command: {
    origin: "pressly_control" as const,
    principal: { kind: "human" as const, id: identityId },
  },
}

const loadedSession = {
  principal: {
    identityId,
    kind: "human" as const,
    displayName: "Owner",
    email: "owner@example.com",
    sessionId,
    sessionIssuedAt: now,
    sessionExpiresAt: expiresAt,
  },
  principalAttributes: {
    assignments: [],
    identityActive: true,
    assuranceLevel: "mfa" as const,
  },
}

const customer = {
  id: customerId,
  businessId,
  version: 2,
  active: true,
  firstName: "Ada",
  lastName: "Lovelace",
  businessName: null,
  phone: null,
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  possibleDuplicateCount: 0,
  createdAt: now,
  updatedAt: now,
}

const order = {
  orderId,
  businessId,
  orderVersion: 3,
  fulfillmentId,
  fulfillmentVersion: 2,
  displayNumber: "A-100",
  state: "open" as const,
  dueAt: now,
  currency: "USD",
  totalAmountCents: 2_500,
  balanceDueCents: 500,
  customer: {
    resolution: "resolved" as const,
    userId: customerId,
    displayName: "Ada Lovelace",
    phone: null,
    email: "ada@example.com",
  },
  fulfillment: {
    typeCode: "wash_fold",
    locationId: "east",
    releaseState: "unreleased" as const,
    estimatedWeightLbs: null,
    estimatedWeightSource: null,
  },
  createdAt: now,
  updatedAt: now,
}

const grant = {
  id: grantId,
  businessId,
  membershipId,
  identityId,
  role: "owner" as const,
  scope: { kind: "business" as const, id: businessId },
  state: "active" as const,
  version: 1,
  startsAt: now,
  endsAt: null,
  effective: true,
}

const member = {
  membershipId,
  businessId,
  identityId,
  displayName: "Owner",
  email: "owner@example.com",
  state: "active" as const,
  version: 1,
  mfaEnabled: true,
  grants: [grant],
  startedAt: now,
  suspendedAt: null,
  endedAt: null,
}

const memberDetail = {
  ...member,
  activeSessionCount: 1,
  createdAt: now,
  updatedAt: now,
}

const invitation = {
  id: invitationId,
  businessId,
  emailNormalized: "invitee@example.com",
  displayName: "Invitee",
  intendedRole: "manager" as const,
  intendedLocationId: null,
  state: "pending" as const,
  version: 1,
  expiresAt,
  createdAt: now,
}

const invitationPreview = {
  invitationId,
  businessId,
  businessName: "Pressly Laundry",
  emailNormalized: "invitee@example.com",
  displayName: "Invitee",
  intendedRole: "manager" as const,
  intendedLocationId: null,
  expiresAt,
  existingIdentity: true,
}

const invitationAcceptance = {
  invitation,
  membershipId,
  identityId,
  identityCreated: false,
  privilegedAccessEffective: true,
  replayed: false,
}

type ManagementFailureKind =
  | "customer_rejected"
  | "location_not_found"
  | "order_rejected"
  | "workforce_rejected"

type ControlExpectedFailure =
  | ManagementFailureKind
  | "authentication"
  | "conflict"
  | "not_found"
  | "permission"
  | "rate_limit"
  | "validation"
  | "mfa_already_enabled"
  | "invalid_mfa_code"
  | "mfa_enrollment_missing"
  | "invalid_credentials"
  | "login_rate_limited"
  | "invalid_mfa_challenge"
  | "expired_mfa_challenge"
  | "invalid_session"
  | "session_expired"
  | "control_access_unavailable"

const peerRejection = () =>
  Object.freeze({
    kind: "failure" as const,
    failure: Object.freeze({
      kind: "permission" as const,
      code: "control_fixture_peer_rejected",
      message: "The fixture peer rejected the request.",
    }),
  })

const expectedFailureOutcome = (
  kind:
    | "authentication"
    | "conflict"
    | "not_found"
    | "permission"
    | "rate_limit"
    | "validation",
  code: string,
) =>
  Object.freeze({
    kind: "failure" as const,
    failure: Object.freeze({
      kind,
      code,
      message: `The fixture produced ${code}.`,
    }),
  })

const makeTarget = (expectedFailure?: ControlExpectedFailure) => {
  const reject = async () => peerRejection()
  return makeControlExperience({
    access: {
      login: {
        execute: async () =>
          expectedFailure === "authentication" ||
          expectedFailure === "invalid_credentials"
            ? expectedFailureOutcome("authentication", "invalid_credentials")
            : expectedFailure === "rate_limit" ||
                expectedFailure === "login_rate_limited"
              ? expectedFailureOutcome("rate_limit", "login_rate_limited")
              : success({ accessToken: "session-token", expiresAt }),
      },
      completeMfaChallenge: {
        execute: async () =>
          expectedFailure === "authentication" ||
          expectedFailure === "invalid_mfa_code" ||
          expectedFailure === "invalid_mfa_challenge" ||
          expectedFailure === "expired_mfa_challenge"
            ? expectedFailureOutcome(
                "authentication",
                expectedFailure === "invalid_mfa_challenge" ||
                  expectedFailure === "expired_mfa_challenge"
                  ? expectedFailure
                  : "invalid_mfa_code",
              )
            : success({ accessToken: "session-token", expiresAt }),
      },
      loadSession: {
        execute: async () =>
          expectedFailure === "authentication" ||
          expectedFailure === "invalid_session" ||
          expectedFailure === "session_expired"
            ? expectedFailureOutcome(
                "authentication",
                expectedFailure === "session_expired"
                  ? "session_expired"
                  : "invalid_session",
              )
            : success(loadedSession),
      },
      revokeSession: {
        execute: async () => success({ revoked: true as const }),
      },
      listIdentitySessions: {
        execute: async () => success({ sessions: [] }),
      },
      revokeIdentitySessions: {
        execute: async () => success({ revokedCount: 1 }),
      },
      beginMfaEnrollment: {
        execute: async () =>
          expectedFailure === "mfa_already_enabled"
            ? expectedFailureOutcome("conflict", "mfa_already_enabled")
            : success({
                secret: "a".repeat(32),
                enrollmentUri: "otpauth://totp/Pressly:owner",
              }),
      },
      confirmMfaEnrollment: {
        execute: async () =>
          expectedFailure === "invalid_mfa_code"
            ? expectedFailureOutcome("authentication", "invalid_mfa_code")
            : expectedFailure === "mfa_enrollment_missing"
              ? expectedFailureOutcome("conflict", "mfa_enrollment_missing")
              : success({ recoveryCodes: ["recovery-code"] }),
      },
      regenerateMfaRecoveryCodes: {
        execute: async () => success({ recoveryCodes: ["recovery-code"] }),
      },
      removeMfa: { execute: async () => success({ updated: true as const }) },
      listEffectiveAccessGrants: {
        execute: async () =>
          success({
            grants:
              expectedFailure === "permission" ||
              expectedFailure === "control_access_unavailable"
                ? []
                : [
                    {
                      businessId,
                      businessName: "Pressly Laundry",
                      role: "owner" as const,
                      scopeKind: "business" as const,
                      scopeId: businessId,
                    },
                  ],
          }),
      },
      listActiveBusinessLocations: {
        execute: async () =>
          success({
            locations: [
              { id: "east", name: "East", timezone: "America/New_York" },
            ],
          }),
      },
      listWorkforce: {
        execute: async () =>
          success({ members: [memberDetail], nextCursor: null }),
      },
      getWorkforceMember: {
        execute: async () => success(memberDetail),
      },
      listWorkforceMemberSessions: {
        execute: async () =>
          success({
            sessions: [
              {
                id: sessionId,
                issuedAt: now.toISOString(),
                lastUsedAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                revokedAt: null,
                current: true,
              },
            ],
          }),
      },
      revokeWorkforceMemberSessions: {
        execute: async () => success({ revokedCount: 1, replayed: false }),
      },
      listWorkforceInvitations: {
        execute: async () =>
          success({ invitations: [invitation], nextCursor: null }),
      },
      issueWorkforceInvitation: {
        execute: async () =>
          success({
            status: "issued" as const,
            invitation,
            token: "t".repeat(40),
          }),
      },
      reissueWorkforceInvitation: {
        execute: async () =>
          success({ status: "replayed" as const, invitation }),
      },
      revokeWorkforceInvitation: {
        execute: async () => success(invitation),
      },
      transitionWorkforceMembership: {
        execute: async () =>
          success({ member: memberDetail, revokedSessionCount: 1 }),
      },
      grantWorkforceAccess: {
        execute: async () => success(grant),
      },
      revokeWorkforceAccess: {
        execute: async () => success({ grant, revokedSessionCount: 1 }),
      },
      listWorkforceSecurityEvents: {
        execute: async () =>
          success({
            events: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                eventType: "workforce.access_granted",
                resourceType: "access_grant",
                actorDisplayName: "Owner",
                createdAt: now.toISOString(),
              },
            ],
            nextCursor: null,
          }),
      },
      previewWorkforceInvitation: {
        execute: async () =>
          expectedFailure === "validation"
            ? expectedFailureOutcome("validation", "workforce_invalid_input")
            : expectedFailure === "not_found"
              ? expectedFailureOutcome(
                  "not_found",
                  "workforce_invitation_not_found",
                )
              : expectedFailure === "conflict"
                ? expectedFailureOutcome("conflict", "workforce_invalid_state")
                : success(invitationPreview),
      },
      acceptWorkforceInvitation: {
        execute: async () =>
          expectedFailure === "validation"
            ? expectedFailureOutcome("validation", "workforce_invalid_input")
            : expectedFailure === "authentication"
              ? expectedFailureOutcome(
                  "authentication",
                  "workforce_identity_mismatch",
                )
              : expectedFailure === "permission"
                ? expectedFailureOutcome(
                    "permission",
                    "workforce_access_denied",
                  )
                : expectedFailure === "not_found"
                  ? expectedFailureOutcome(
                      "not_found",
                      "workforce_invitation_not_found",
                    )
                  : expectedFailure === "conflict"
                    ? expectedFailureOutcome(
                        "conflict",
                        "workforce_invalid_state",
                      )
                    : success(invitationAcceptance),
      },
      ...(expectedFailure === "workforce_rejected"
        ? {
            listWorkforce: { execute: reject },
            getWorkforceMember: { execute: reject },
            listWorkforceMemberSessions: { execute: reject },
            revokeWorkforceMemberSessions: { execute: reject },
            listWorkforceInvitations: { execute: reject },
            issueWorkforceInvitation: { execute: reject },
            reissueWorkforceInvitation: { execute: reject },
            revokeWorkforceInvitation: { execute: reject },
            transitionWorkforceMembership: { execute: reject },
            grantWorkforceAccess: { execute: reject },
            revokeWorkforceAccess: { execute: reject },
            listWorkforceSecurityEvents: { execute: reject },
          }
        : {}),
    },
    customers: {
      listCustomers: {
        execute: async () => success({ items: [customer], nextCursor: null }),
      },
      getCustomer: { execute: async () => success(customer) },
      createCustomer: {
        execute: async () =>
          success({ userId: customerId, version: 2, replayed: false }),
      },
      updateCustomer: {
        execute: async () =>
          success({ userId: customerId, version: 2, replayed: false }),
      },
      ...(expectedFailure === "customer_rejected"
        ? {
            listCustomers: { execute: reject },
            getCustomer: { execute: reject },
            createCustomer: { execute: reject },
            updateCustomer: { execute: reject },
          }
        : {}),
    },
    orders: {
      listOrders: {
        execute: async () => success({ items: [order], nextCursor: null }),
      },
      getOrder: {
        execute: async () => success({ ...order, items: [] }),
      },
      createOrder: {
        execute: async () =>
          success({
            orderId,
            fulfillmentId,
            version: 3,
            replayed: false,
          }),
      },
      correctOrder: {
        execute: async () =>
          success({
            orderId,
            fulfillmentId,
            version: 3,
            replayed: false,
          }),
      },
      ...(expectedFailure === "order_rejected"
        ? {
            listOrders: { execute: reject },
            getOrder: { execute: reject },
            createOrder: { execute: reject },
            correctOrder: { execute: reject },
          }
        : {}),
    },
    presentation: {
      deriveCsrfToken: () => "a".repeat(43),
      serializeCookies: () => [],
    },
    controlOrigin: "https://control.pressly.test",
    processorOrigin: "https://processor.pressly.test",
  } as never)
}

const controlExecution = (
  operationId: string,
  expectedFailure?: ControlExpectedFailure,
) => {
  const cells = makeTarget(expectedFailure).cells
  const executions: Readonly<Record<string, () => Promise<unknown>>> = {
    "control.auth-login.v1": () =>
      cells.login.execute({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    "control.complete-mfa-challenge.v1": () =>
      cells.completeMfaChallenge.execute({
        challengeToken: "challenge-token",
        method: "totp",
        code: "123456",
      }),
    "control.load-auth-session.v1": () =>
      cells.loadSession.execute({ sessionToken: "session-token" }),
    "control.logout.v1": () =>
      cells.logout.execute({ sessionToken: "session-token" }),
    "control.list-identity-sessions.v1": () =>
      cells.listIdentitySessions.execute({ identityId }),
    "control.revoke-all-identity-sessions.v1": () =>
      cells.revokeAllIdentitySessions.execute({
        principalIdentityId: identityId,
        identityId,
      }),
    "control.revoke-identity-session.v1": () =>
      cells.revokeIdentitySession.execute({
        principalIdentityId: identityId,
        identityId,
        sessionId,
      }),
    "control.begin-mfa-enrollment.v1": () =>
      cells.beginMfaEnrollment.execute({ identityId, label: "Owner" }),
    "control.confirm-mfa-enrollment.v1": () =>
      cells.confirmMfaEnrollment.execute({
        identityId,
        sessionId,
        code: "123456",
      }),
    "control.regenerate-mfa-recovery-codes.v1": () =>
      cells.regenerateMfaRecoveryCodes.execute({ identityId }),
    "control.remove-mfa.v1": () =>
      cells.removeMfa.execute({ identityId, sessionId }),
    "control.cli-auth-api-login.v1": () =>
      cells.cliAuthApiLogin.execute({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    "control.cli-auth-api-complete-mfa-challenge.v1": () =>
      cells.cliAuthApiCompleteMfaChallenge.execute({
        challengeToken: "challenge-token",
        method: "totp",
        code: "123456",
      }),
    "control.cli-auth-api-load-session.v1": () =>
      cells.cliAuthApiLoadSession.execute({ bearerToken: "session-token" }),
    "control.cli-auth-api-logout.v1": () =>
      cells.cliAuthApiLogout.execute({ bearerToken: "session-token" }),
    "control.cli-auth-api-begin-mfa-enrollment.v1": () =>
      cells.cliAuthApiBeginMfaEnrollment.execute({
        identityId,
        label: "Owner",
      }),
    "control.cli-auth-api-confirm-mfa-enrollment.v1": () =>
      cells.cliAuthApiConfirmMfaEnrollment.execute({
        identityId,
        sessionId,
        code: "123456",
      }),
    "control.cli-auth-api-regenerate-mfa-recovery-codes.v1": () =>
      cells.cliAuthApiRegenerateMfaRecoveryCodes.execute({ identityId }),
    "control.cli-auth-api-remove-mfa.v1": () =>
      cells.cliAuthApiRemoveMfa.execute({ identityId, sessionId }),
    "control.resolve-access.v1": () =>
      cells.resolveAccess.execute({ identityId, assuranceLevel: "mfa" }),
    "control.list-customers.v1": () =>
      cells.listCustomers.execute({ context, limit: 50 }),
    "control.get-customer.v1": () =>
      cells.getCustomer.execute({ context, userId: customerId }),
    "control.create-customer.v1": () =>
      cells.createCustomer.execute({
        context,
        idempotencyKey: "customer-create-key",
        profile: {
          firstName: "Ada",
          lastName: "Lovelace",
          businessName: null,
          phone: null,
          email: "ada@example.com",
        },
      }),
    "control.update-customer.v1": () =>
      cells.updateCustomer.execute({
        context,
        userId: customerId,
        idempotencyKey: "customer-update-key",
        expectedVersion: 1,
        changes: { active: false },
      }),
    "control.list-orders.v1": () =>
      cells.listOrders.execute({
        context,
        limit: 50,
        ...(expectedFailure === "location_not_found"
          ? { locationId: "outside-control-location" }
          : {}),
      }),
    "control.get-order.v1": () => cells.getOrder.execute({ context, orderId }),
    "control.create-order.v1": () =>
      cells.createOrder.execute({
        context,
        idempotencyKey: "order-create-key",
        reasonCode: "new_customer_order",
        reasonNote: null,
        customer: { resolution: "resolved", userId: customerId },
        displayNumber: null,
        dueAt: now,
        currency: "USD",
        totalAmountCents: 100,
        balanceDueCents: null,
        items: [],
        fulfillment: {
          typeCode: "wash_fold",
          locationId:
            expectedFailure === "location_not_found"
              ? "outside-control-location"
              : "east",
          estimatedWeightLbs: null,
          estimatedWeightSource: null,
        },
      }),
    "control.correct-order.v1": () =>
      cells.correctOrder.execute({
        context,
        orderId,
        idempotencyKey: "order-correct-key",
        reasonCode: "manager_correction",
        reasonNote: null,
        expectedOrderVersion: 3,
        expectedFulfillmentVersion: 2,
        changes: { dueAt: now },
      }),
    "control.list-members.v1": () =>
      cells.listMembers.execute({ context, limit: 50 }),
    "control.get-member.v1": () =>
      cells.getMember.execute({ context, membershipId }),
    "control.list-member-sessions.v1": () =>
      cells.listMemberSessions.execute({ context, membershipId }),
    "control.revoke-member-sessions.v1": () =>
      cells.revokeMemberSessions.execute({
        context,
        membershipId,
        idempotencyKey: "revoke-sessions-key",
      }),
    "control.list-invitations.v1": () =>
      cells.listInvitations.execute({
        context,
        includeTerminal: false,
        limit: 50,
      }),
    "control.issue-invitation.v1": () =>
      cells.issueInvitation.execute({
        context,
        idempotencyKey: "issue-invite-key",
        email: "invitee@example.com",
        displayName: "Invitee",
        intendedRole: "manager",
        intendedLocationId: null,
      }),
    "control.reissue-invitation.v1": () =>
      cells.reissueInvitation.execute({
        context,
        invitationId,
        expectedVersion: 1,
        idempotencyKey: "reissue-invite-key",
      }),
    "control.revoke-invitation.v1": () =>
      cells.revokeInvitation.execute({
        context,
        invitationId,
        expectedVersion: 1,
        idempotencyKey: "revoke-invite-key",
      }),
    "control.suspend-membership.v1": () =>
      cells.suspendMembership.execute({
        context,
        membershipId,
        expectedVersion: 1,
        idempotencyKey: "suspend-member-key",
      }),
    "control.reactivate-membership.v1": () =>
      cells.reactivateMembership.execute({
        context,
        membershipId,
        expectedVersion: 1,
        idempotencyKey: "reactivate-member-key",
      }),
    "control.end-membership.v1": () =>
      cells.endMembership.execute({
        context,
        membershipId,
        expectedVersion: 1,
        idempotencyKey: "end-member-key",
      }),
    "control.grant-access.v1": () =>
      cells.grantAccess.execute({
        context,
        membershipId,
        identityId,
        role: "owner",
        scope: { kind: "business", id: businessId },
        idempotencyKey: "grant-access-key",
      }),
    "control.revoke-access.v1": () =>
      cells.revokeAccess.execute({
        context,
        grantId,
        expectedVersion: 1,
        idempotencyKey: "revoke-access-key",
      }),
    "control.list-security-events.v1": () =>
      cells.listSecurityEvents.execute({ context, limit: 50 }),
    "control.preview-invitation.v1": () =>
      cells.previewInvitation.execute({ acceptanceToken: "t".repeat(40) }),
    "control.accept-new-invitation.v1": () =>
      cells.acceptNewInvitation.execute({
        identityMode: "new_identity",
        acceptanceToken: "t".repeat(40),
        idempotencyKey: "accept-new-key",
        password: "correct-horse-battery-staple",
      }),
    "control.accept-existing-invitation.v1": () =>
      cells.acceptExistingInvitation.execute({
        identityMode: "existing_identity",
        acceptanceToken: "t".repeat(40),
        idempotencyKey: "accept-existing-key",
        context,
      }),
    "control.accept-existing-invitation-password.v1": () =>
      cells.acceptExistingInvitationPassword.execute({
        acceptanceToken: "t".repeat(40),
        idempotencyKey: "accept-password-key",
        password: "correct-horse-battery-staple",
      }),
    "control.accept-existing-invitation-mfa.v1": () =>
      cells.acceptExistingInvitationMfa.execute({
        acceptanceToken: "t".repeat(40),
        idempotencyKey: "accept-mfa-key",
        challengeToken: "challenge-token",
        method: "totp",
        code: "123456",
      }),
  }
  return executions[operationId]?.()
}

const cliSession = {
  accessToken: "session-token",
  expiresAt: expiresAt.toISOString(),
  principal: {
    identityId,
    displayName: "Owner",
    email: "owner@example.com",
    roles: ["owner"],
  },
}

const makeCliTarget = () =>
  makeAdminCliExperience({
    auth: {
      api: {
        login: async () => success(cliSession),
        completeMfaChallenge: async () => success(cliSession),
        loadSession: async () =>
          success({
            expiresAt: cliSession.expiresAt,
            principal: cliSession.principal,
          }),
        logout: async () => success({ revoked: true }),
        beginMfaEnrollment: async () =>
          success({
            secret: "a".repeat(32),
            enrollmentUri: "otpauth://totp/Pressly:owner",
          }),
        confirmMfaEnrollment: async () =>
          success({ recoveryCodes: ["recovery-code"] }),
        regenerateMfaRecoveryCodes: async () =>
          success({ recoveryCodes: ["recovery-code"] }),
        removeMfa: async () => success({ updated: true }),
      },
      session: {
        read: async () => success(cliSession),
        write: async () => success(undefined),
        clear: async () => success(undefined),
      },
    },
    pricing: {
      api: {
        loadCatalog: async () =>
          success({
            serviceSlug: "wash-fold" as const,
            currency: "USD",
            updatedAt: now.toISOString(),
            items: [],
          }),
        planChange: async (_token, input) =>
          success({
            serviceSlug: input.serviceSlug,
            reason: input.reason,
            oldPricingSetId: "old-set",
            currency: "USD",
            changes: [],
          }),
        publishChange: async () =>
          success({
            oldPricingSetId: "old-set",
            newPricingSetId: "new-set",
            auditEventId: "audit-event",
            changeItemCount: 1,
          }),
      },
      session: {
        read: async () => success(cliSession),
        write: async () => success(undefined),
        clear: async () => success(undefined),
      },
    },
    productionBootstrap: {
      runExclusive: (work) => work(),
      prepare: async () =>
        success({
          manageLocation: async ({ dryRun }) =>
            success({
              status: "converged" as const,
              mode: dryRun ? ("dry_run" as const) : ("apply" as const),
              applied: !dryRun,
            }),
          manageProduction: async ({ dryRun }) =>
            success({
              status: "converged" as const,
              mode: dryRun ? ("dry_run" as const) : ("apply" as const),
              applied: !dryRun,
            }),
          manageSourceLocationBindings: async ({ dryRun }) =>
            success({
              status: "converged" as const,
              mode: dryRun ? ("dry_run" as const) : ("apply" as const),
              applied: !dryRun,
            }),
        }),
    },
  })

const diagnosticFailure = () =>
  Object.freeze({
    kind: "failure" as const,
    failure: Object.freeze({
      kind: "diagnostic" as const,
      code: "future_upstream_diagnostic",
      message: "A future upstream diagnostic was preserved.",
    }),
  })

const makeFailingCliTarget = () => {
  const fail = async () => diagnosticFailure()
  return makeAdminCliExperience({
    auth: {
      api: {
        login: fail,
        completeMfaChallenge: fail,
        loadSession: fail,
        logout: fail,
        beginMfaEnrollment: fail,
        confirmMfaEnrollment: fail,
        regenerateMfaRecoveryCodes: fail,
        removeMfa: fail,
      },
      session: { read: fail, write: fail, clear: fail },
    },
    pricing: {
      api: { loadCatalog: fail, planChange: fail, publishChange: fail },
      session: { read: fail, write: fail, clear: fail },
    },
    productionBootstrap: { prepare: fail, runExclusive: (work) => work() },
  })
}

const cliExecution = (operationId: string, failing = false) => {
  const cells = (failing ? makeFailingCliTarget() : makeCliTarget()).cells
  const pricing = {
    serviceSlug: "wash-fold" as const,
    reason: "Seasonal price update",
    items: [{ code: "wash-fold", priceCents: 2_500 }],
  }
  const executions: Readonly<Record<string, () => Promise<unknown>>> = {
    "control.cli-auth-login.v1": () =>
      cells.login.execute({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    "control.cli-auth-session.v1": () => cells.session.execute({}),
    "control.cli-auth-logout.v1": () => cells.logout.execute({}),
    "control.cli-auth-mfa-enroll.v1": () => cells.mfaEnroll.execute({}),
    "control.cli-auth-mfa-confirm.v1": () =>
      cells.mfaConfirm.execute({ code: "123456" }),
    "control.cli-auth-mfa-recovery-codes.v1": () =>
      cells.mfaRecoveryCodes.execute({}),
    "control.cli-auth-mfa-remove.v1": () => cells.mfaRemove.execute({}),
    "control.cli-pricing-show.v1": () =>
      cells.show.execute({ serviceSlug: pricing.serviceSlug }),
    "control.cli-pricing-plan.v1": () => cells.plan.execute(pricing),
    "control.cli-pricing-publish.v1": () =>
      cells.publish.execute({
        ...pricing,
        stage: "publish",
        confirmed: true,
      }),
    "control.cli-bootstrap-production.v2": () =>
      cells.productionBootstrap.execute({
        file: "production.json",
        actorId: identityId,
        idempotencyKey: "bootstrap-production-key",
        dryRun: true,
      }),
  }
  return executions[operationId]?.()
}

export const expectControlOperationSuccess = async (
  operationId: string,
): Promise<void> => {
  const execution =
    operationId.startsWith("control.cli-") &&
    !operationId.startsWith("control.cli-auth-api-")
      ? cliExecution(operationId)
      : controlExecution(operationId)
  expect(execution, `No execution fixture for ${operationId}`).toBeDefined()
  const outcome = await execution
  expect(outcome).toMatchObject({ kind: "success" })
}

export const expectControlManagementFailure = async (
  operationId: string,
  expectedKind: ManagementFailureKind,
): Promise<void> => {
  const execution = controlExecution(operationId, expectedKind)
  expect(execution, `No execution fixture for ${operationId}`).toBeDefined()
  await expect(execution).resolves.toMatchObject({
    kind: "failure",
    failure: { kind: expectedKind },
  })
}

export const expectControlFailureKind = async (
  operationId: string,
  expectedKind:
    | "authentication"
    | "conflict"
    | "not_found"
    | "permission"
    | "rate_limit"
    | "validation",
): Promise<void> => {
  const execution = controlExecution(operationId, expectedKind)
  expect(execution, `No execution fixture for ${operationId}`).toBeDefined()
  await expect(execution).resolves.toMatchObject({
    kind: "failure",
    failure: { kind: expectedKind },
  })
}

export const expectControlFailureCode = async (
  operationId: string,
  expectedCode:
    | "mfa_already_enabled"
    | "invalid_mfa_code"
    | "mfa_enrollment_missing"
    | "invalid_credentials"
    | "login_rate_limited"
    | "invalid_mfa_challenge"
    | "expired_mfa_challenge"
    | "invalid_session"
    | "session_expired"
    | "control_access_unavailable",
): Promise<void> => {
  const execution = controlExecution(operationId, expectedCode)
  expect(execution, `No execution fixture for ${operationId}`).toBeDefined()
  await expect(execution).resolves.toMatchObject({
    kind: "failure",
    failure: { code: expectedCode },
  })
}

export const expectControlCliDiagnosticFailure = async (
  operationId: string,
  expectedKind: "diagnostic",
): Promise<void> => {
  const execution = cliExecution(operationId, true)
  expect(execution, `No CLI execution fixture for ${operationId}`).toBeDefined()
  const expected = diagnosticFailure()
  expect(expected.failure.kind).toBe(expectedKind)
  await expect(execution).resolves.toEqual(expected)
}
