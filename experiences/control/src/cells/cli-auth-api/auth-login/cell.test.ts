import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect, vi } from "vitest"
import { controlCliAuthApiLoginCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiLoginCell } from "./execute.ts"
import {
  expectControlFailureCode,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-api-login.v1",
  declaration: controlCliAuthApiLoginCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "Control CLI API login declares its bearer realm and establishes an owner session",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(controlCliAuthApiLoginCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "http",
            method: "POST",
            path: "/control/cli/auth/login",
          },
        )
        await expectControlOperationSuccess("control.cli-auth-api-login.v1")
      },
    },
    {
      name: "Control CLI API login preserves credential rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-login.v1",
          "invalid_credentials",
        ),
    },
    {
      name: "Control CLI API login preserves login_rate_limited rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-login.v1",
          "login_rate_limited",
        ),
    },
    {
      name: "Control CLI API login rejects identities outside Control authority",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlFailureCode(
          "control.cli-auth-api-login.v1",
          "control_access_unavailable",
        )

        const revokeSession = vi.fn(async () => ({
          kind: "success" as const,
          value: { revoked: true as const },
        }))
        const identityId = "22222222-2222-4222-8222-222222222222"
        const expiresAt = new Date("2026-08-25T12:00:00.000Z")
        const cell = makeControlCliAuthApiLoginCell({
          login: {
            execute: async () => ({
              kind: "success" as const,
              value: {
                accessToken: "newly-issued-control-cli-token",
                expiresAt,
                principal: {
                  identityId,
                  kind: "human" as const,
                  displayName: "Denied Owner",
                  roles: [],
                },
              },
            }),
          },
          loadSession: {
            execute: async () => ({
              kind: "success" as const,
              value: {
                principal: {
                  identityId,
                  kind: "human" as const,
                  displayName: "Denied Owner",
                  sessionId: "33333333-3333-4333-8333-333333333333",
                  sessionIssuedAt: new Date("2026-08-24T12:00:00.000Z"),
                  sessionExpiresAt: expiresAt,
                },
                principalAttributes: {
                  assignments: [],
                  identityActive: true,
                  assuranceLevel: "password" as const,
                },
              },
            }),
          },
          revokeSession: { execute: revokeSession },
          resolveIdentityAccess: async () => null,
        })

        await expect(
          cell.execute({
            email: "denied@example.com",
            password: "correct-horse-battery-staple",
            requestId: "cli-login-denied-request",
          }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "control_access_unavailable" },
        })
        expect(revokeSession).toHaveBeenCalledTimes(1)
        expect(revokeSession).toHaveBeenCalledWith({
          bearerToken: "newly-issued-control-cli-token",
          requestId: "cli-login-denied-request",
        })
      },
    },
  ],
})
