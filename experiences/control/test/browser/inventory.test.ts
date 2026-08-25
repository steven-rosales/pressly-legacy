import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlAuthenticationBrowserClient,
  makeControlCustomersBrowserClient,
  makeControlInvitationsBrowserClient,
  makeControlOrdersBrowserClient,
  makeControlSecurityBrowserClient,
  makeControlWorkforceBrowserClient,
} from "../../src/browser.ts"
import {
  allControlBrowserOperations,
  controlAuthenticationOperations,
  controlCustomerOperations,
  controlInvitationOperations,
  controlOrderOperations,
  controlSecurityOperations,
  controlWorkforceOperations,
} from "./operations.fixture.ts"

const packageRoot = process.cwd()
const browserRoot = resolve(packageRoot, "src/browser")

describe("Control browser-client inventory", () => {
  it("publishes one browser composition and seven explicit contract subpaths", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8"),
    ) as Readonly<{ exports: Readonly<Record<string, unknown>> }>

    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      "./browser",
      "./contracts/authentication-v1",
      "./contracts/customers-v1",
      "./contracts/invitations-v1",
      "./contracts/orders-v1",
      "./contracts/security-v1",
      "./contracts/workforce-v1",
      "./contracts/cli-v1",
      "./cli/runtime",
      "./cli/presentation",
      "./operations/access/resolve-access/cell",
      "./testing/assembly",
      "./testing/auth-boundaries",
      "./testing/management-boundaries",
    ])
    expect(JSON.stringify(manifest.exports["./browser"])).toContain(
      "dist/browser.js",
    )
  })

  it("declares exactly 38 unique operation identities across explicit leaves", () => {
    expect(Object.keys(controlAuthenticationOperations)).toHaveLength(11)
    expect(Object.keys(controlWorkforceOperations)).toHaveLength(13)
    expect(Object.keys(controlInvitationOperations)).toHaveLength(5)
    expect(Object.keys(controlCustomerOperations)).toHaveLength(4)
    expect(Object.keys(controlOrderOperations)).toHaveLength(4)
    expect(Object.keys(controlSecurityOperations)).toHaveLength(1)
    expect(allControlBrowserOperations).toHaveLength(38)
    expect(
      new Set(
        allControlBrowserOperations.map((operation) => operation.operationId),
      ).size,
    ).toBe(38)
  })

  it("exposes feature clients rather than a generic command switch", () => {
    const request = vi.fn()
    const authentication = makeControlAuthenticationBrowserClient({
      operations: controlAuthenticationOperations,
      request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })
    const workforce = makeControlWorkforceBrowserClient({
      operations: controlWorkforceOperations,
      request,
      idempotencyKey: () => "unused-key",
    })
    const invitations = makeControlInvitationsBrowserClient({
      operations: controlInvitationOperations,
      request,
      acceptCsrfToken: vi.fn(),
    })
    const customers = makeControlCustomersBrowserClient({
      operations: controlCustomerOperations,
      request,
      idempotencyKey: () => "unused-key",
    })
    const orders = makeControlOrdersBrowserClient({
      operations: controlOrderOperations,
      request,
      idempotencyKey: () => "unused-key",
    })
    const security = makeControlSecurityBrowserClient({
      operations: controlSecurityOperations,
      request,
    })

    expect(Object.keys(authentication).sort()).toEqual([
      "beginMfaEnrollment",
      "completeMfa",
      "confirmMfaEnrollment",
      "listIdentitySessions",
      "login",
      "logout",
      "regenerateRecoveryCodes",
      "removeMfa",
      "restore",
      "revokeAllIdentitySessions",
      "revokeIdentitySession",
    ])
    expect(Object.keys(workforce).sort()).toEqual([
      "getMember",
      "grantAccess",
      "issueInvitation",
      "listInvitations",
      "listMemberSessions",
      "listMembers",
      "reissueInvitation",
      "revokeAccess",
      "revokeInvitation",
      "revokeMemberSessions",
      "transitionMember",
    ])
    expect(Object.keys(invitations).sort()).toEqual([
      "acceptExisting",
      "acceptExistingMfa",
      "acceptExistingPassword",
      "acceptNewIdentity",
      "preview",
    ])
    expect(Object.keys(customers).sort()).toEqual([
      "create",
      "get",
      "list",
      "update",
    ])
    expect(Object.keys(orders).sort()).toEqual([
      "correct",
      "create",
      "get",
      "list",
    ])
    expect(Object.keys(security)).toEqual(["listSecurityEvents"])
  })

  it("has no handwritten Control routes or target application-model imports", () => {
    const source = readdirSync(browserRoot, {
      encoding: "utf8",
      recursive: true,
    })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(resolve(browserRoot, file), "utf8"))
      .join("\n")

    expect(source).not.toMatch(/['"`]\/control\//)
    expect(source).not.toMatch(
      /from ['"]\.\.\/\.\.\/(?:auth|management|server)\//,
    )
    expect(source).not.toContain("@pressly/orders-system")
    expect(source).not.toContain("@pressly/contracts")
    expect(source).toContain("/contracts/")
  })
})
