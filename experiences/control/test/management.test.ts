import { describe, expect, it } from "vitest"
import {
  controlCellDeclarations,
  controlManagementCellDeclarations,
} from "../src/control-experience.ts"
import { controlManagementBoundaryRequirements } from "../src/management/boundary-profiles.ts"
import { getControlCustomerContract } from "../src/cells/customers/get-customer/contract.ts"
import { listControlCustomersContract } from "../src/cells/customers/list-customers/contract.ts"
import { projectControlCustomer } from "../src/cells/customers/get-customer/execute.ts"
import { createControlOrderCellDeclaration } from "../src/cells/orders/create-order/cell.ts"
import { getControlOrderContract } from "../src/cells/orders/get-order/contract.ts"
import { getControlMemberContract } from "../src/cells/workforce/get-member/contract.ts"
import { grantControlAccessCellDeclaration } from "../src/cells/workforce/grant-access/cell.ts"
import { listControlMembersContract } from "../src/cells/workforce/list-members/contract.ts"
import { projectControlMember } from "../src/management/workforce/projection.ts"

const expectedRoutes = [
  ["GET", "/control/customers"],
  ["GET", "/control/customers/:userId"],
  ["POST", "/control/customers"],
  ["PATCH", "/control/customers/:userId"],
  ["GET", "/control/orders"],
  ["GET", "/control/orders/:orderId"],
  ["POST", "/control/orders"],
  ["PATCH", "/control/orders/:orderId"],
  ["GET", "/control/team"],
  ["GET", "/control/team/:membershipId"],
  ["GET", "/control/team/:membershipId/sessions"],
  ["POST", "/control/team/:membershipId/sessions/revoke"],
  ["GET", "/control/invitations"],
  ["POST", "/control/invitations"],
  ["POST", "/control/invitations/:invitationId/reissue"],
  ["POST", "/control/invitations/:invitationId/revoke"],
  ["POST", "/control/team/:membershipId/suspend"],
  ["POST", "/control/team/:membershipId/reactivate"],
  ["POST", "/control/team/:membershipId/end"],
  ["POST", "/control/team/:membershipId/grants"],
  ["POST", "/control/grants/:grantId/revoke"],
  ["GET", "/control/security/events"],
  ["POST", "/control/invitations/preview"],
  ["POST", "/control/invitations/accept/new"],
  ["POST", "/control/invitations/accept/existing/password"],
  ["POST", "/control/invitations/accept/existing/mfa"],
  ["POST", "/control/invitations/accept/existing"],
] as const

describe("Control administration Experience", () => {
  it("declares the exact 27 administration routes and 47-cell assembly inventory", () => {
    const declarations = Object.values(controlManagementCellDeclarations)
    expect(declarations).toHaveLength(27)
    expect(Object.values(controlCellDeclarations)).toHaveLength(47)
    expect(
      new Set(declarations.map((declaration) => declaration.id)).size,
    ).toBe(27)
    expect(
      declarations
        .map((declaration) => {
          expect(declaration.contract.input.version).toBe(1)
          expect(declaration.contract.output.version).toBe(1)
          expect(declaration.contract.failure.version).toBe(1)
          expect(declaration.surfaces).toHaveLength(1)
          const surface = declaration.surfaces[0]
          expect(surface?.kind).toBe("http")
          return surface?.kind === "http"
            ? ([surface.method, surface.path] as const)
            : (["", ""] as const)
        })
        .sort((left, right) => left[1].localeCompare(right[1])),
    ).toEqual(
      [...expectedRoutes].sort((left, right) =>
        left[1].localeCompare(right[1]),
      ),
    )
  })

  it("pins conditional versus required JSON, cookie failure observation and no-store parity", () => {
    expect(controlManagementBoundaryRequirements).toHaveLength(27)
    expect(
      controlManagementBoundaryRequirements.filter(
        (requirement) =>
          requirement.profile.requestBody?.contentType === "parse-if-matching",
      ),
    ).toHaveLength(22)
    expect(
      controlManagementBoundaryRequirements.filter(
        (requirement) =>
          requirement.profile.requestBody?.contentType === "required",
      ),
    ).toHaveLength(5)
    expect(
      controlManagementBoundaryRequirements
        .filter(
          (requirement) =>
            requirement.profile.expectedFailureObservation ===
            "cookie-auth-failure",
        )
        .map((requirement) => requirement.operationId),
    ).toEqual([
      "control.accept-existing-invitation-password.v1",
      "control.accept-existing-invitation-mfa.v1",
    ])
    expect(
      controlManagementBoundaryRequirements.every(
        (requirement) => !requirement.profile.noStore,
      ),
    ).toBe(true)
  })

  it("encodes model dates to canonical ISO and decodes them back to Dates", () => {
    const instant = new Date("2026-08-22T19:30:00.000Z")
    const customer = {
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      active: true,
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: null,
      phone: null,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      possibleDuplicateCount: 0,
      createdAt: instant,
      updatedAt: instant,
    }
    expect(getControlCustomerContract.output.encode(customer)).toMatchObject({
      createdAt: instant.toISOString(),
      updatedAt: instant.toISOString(),
    })
    const decodedCustomer = getControlCustomerContract.output.decode(
      getControlCustomerContract.output.encode(customer),
    )
    expect(decodedCustomer).toMatchObject({
      kind: "valid",
      value: { createdAt: instant, updatedAt: instant },
    })

    const order = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1,
      displayNumber: null,
      state: "open" as const,
      dueAt: instant,
      currency: "USD",
      totalAmountCents: 100,
      balanceDueCents: null,
      customer: {
        resolution: "resolved" as const,
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: "Ada Lovelace",
        phone: null,
        email: "ada@example.com",
      },
      fulfillment: {
        id: "33333333-3333-4333-8333-333333333333",
        version: 1,
        typeCode: "wash_fold",
        locationId: "east",
        releaseState: "unreleased" as const,
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      },
      createdAt: instant,
      updatedAt: instant,
      items: [],
    }
    expect(getControlOrderContract.output.encode(order)).toMatchObject({
      dueAt: instant.toISOString(),
      createdAt: instant.toISOString(),
      updatedAt: instant.toISOString(),
    })

    const member = {
      membershipId: "44444444-4444-4444-8444-444444444444",
      businessId: "55555555-5555-4555-8555-555555555555",
      identityId: "66666666-6666-4666-8666-666666666666",
      displayName: "Grace Hopper",
      email: "grace@example.com",
      state: "active" as const,
      version: 1,
      mfaEnabled: true,
      grants: [],
      startedAt: instant,
      suspendedAt: null,
      endedAt: null,
      activeSessionCount: 1,
      createdAt: instant,
      updatedAt: instant,
    }
    expect(getControlMemberContract.output.encode(member)).toMatchObject({
      startedAt: instant.toISOString(),
      createdAt: instant.toISOString(),
      updatedAt: instant.toISOString(),
    })
  })

  it("strips owner-only fields before strict Customer and Workforce list encoding", () => {
    const instant = new Date("2026-08-22T19:30:00.000Z")
    const businessId = "55555555-5555-4555-8555-555555555555"
    const customer = projectControlCustomer({
      id: "11111111-1111-4111-8111-111111111111",
      businessId,
      version: 1,
      active: true,
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: null,
      phone: null,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      possibleDuplicateCount: 0,
      createdAt: instant,
      updatedAt: instant,
    })
    expect(customer).not.toHaveProperty("businessId")
    expect(
      listControlCustomersContract.output.encode({
        items: [customer],
        nextCursor: null,
      }),
    ).toMatchObject({
      items: [
        {
          id: customer.id,
          createdAt: instant.toISOString(),
          updatedAt: instant.toISOString(),
        },
      ],
    })

    const memberDetail = {
      membershipId: "44444444-4444-4444-8444-444444444444",
      businessId,
      identityId: "66666666-6666-4666-8666-666666666666",
      displayName: "Grace Hopper",
      email: "grace@example.com",
      state: "active" as const,
      version: 1,
      mfaEnabled: true,
      grants: [],
      startedAt: instant,
      suspendedAt: null,
      endedAt: null,
      activeSessionCount: 1,
      createdAt: instant,
      updatedAt: instant,
    }
    const member = projectControlMember(memberDetail)
    expect(member).not.toHaveProperty("activeSessionCount")
    expect(member).not.toHaveProperty("createdAt")
    expect(member).not.toHaveProperty("updatedAt")
    expect(
      listControlMembersContract.output.encode({
        members: [member],
        nextCursor: null,
      }),
    ).toMatchObject({
      members: [
        {
          membershipId: member.membershipId,
          startedAt: instant.toISOString(),
        },
      ],
    })
  })

  it("keeps codec-bearing mutation bodies serialized until contract decode", () => {
    const identityId = "11111111-1111-4111-8111-111111111111"
    const businessId = "22222222-2222-4222-8222-222222222222"
    const membershipId = "33333333-3333-4333-8333-333333333333"
    const dueAt = "2026-08-23T21:00:00.000Z"
    const startsAt = "2026-08-22T19:30:00.000Z"
    const context = {
      access: {
        business: { id: businessId, name: "Pressly Laundry" },
        locations: [
          {
            id: "east",
            name: "East",
            timezone: "America/New_York",
          },
        ],
        selectedLocationId: "east",
        capabilities: ["orders:write", "team:write"],
        applications: [],
      },
      actor: { identityId, sessionId: identityId },
      command: {
        origin: "pressly_control",
        principal: { kind: "human", id: identityId },
      },
    }

    const orderSurface = createControlOrderCellDeclaration.surfaces[0]
    expect(orderSurface?.kind).toBe("http")
    if (orderSurface?.kind !== "http") return
    const orderRequest = {
      params: {},
      query: {},
      headers: {},
      context,
      body: {
        idempotencyKey: "create-order-key",
        reasonCode: "new_customer_order",
        reasonNote: "Created in Pressly Control.",
        customer: { resolution: "resolved", userId: identityId },
        displayNumber: "A-100",
        dueAt,
        currency: "USD",
        totalAmountCents: 4_200,
        balanceDueCents: 4_200,
        items: [],
        fulfillment: {
          typeCode: "wash_fold",
          locationId: "east",
          estimatedWeightLbs: 18,
          estimatedWeightSource: "control_manager_entry",
        },
      },
    }
    expect(orderSurface.validateRequest).not.toBeNull()
    if (orderSurface.validateRequest === null) return
    orderSurface.validateRequest(orderRequest)
    const serializedOrder = orderSurface.toSerializedInput(orderRequest)
    expect(serializedOrder).toMatchObject({ dueAt })
    expect(
      createControlOrderCellDeclaration.contract.input.decode(serializedOrder),
    ).toMatchObject({ kind: "valid", value: { dueAt: new Date(dueAt) } })

    const grantSurface = grantControlAccessCellDeclaration.surfaces[0]
    expect(grantSurface?.kind).toBe("http")
    if (grantSurface?.kind !== "http") return
    const grantRequest = {
      params: { membershipId },
      query: {},
      headers: {},
      context,
      body: {
        idempotencyKey: "grant-access-key",
        identityId,
        role: "manager",
        scope: { kind: "business", id: businessId },
        startsAt,
      },
    }
    expect(grantSurface.validateRequest).not.toBeNull()
    if (grantSurface.validateRequest === null) return
    grantSurface.validateRequest(grantRequest)
    const serializedGrant = grantSurface.toSerializedInput(grantRequest)
    expect(serializedGrant).toMatchObject({ startsAt })
    expect(
      grantControlAccessCellDeclaration.contract.input.decode(serializedGrant),
    ).toMatchObject({
      kind: "valid",
      value: { startsAt: new Date(startsAt) },
    })
  })
})
