import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect, vi } from "vitest"
import { controlCliAuthApiLoadSessionCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiLoadSessionCell } from "./execute.ts"
import {
  expectControlFailureCode,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-api-load-session.v1",
  declaration: controlCliAuthApiLoadSessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "Control CLI API session query declares the raw bearer route and reloads Control authority",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiLoadSessionCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/cli/auth/session",
        })
        await expectControlOperationSuccess(
          "control.cli-auth-api-load-session.v1",
        )
      },
    },
    {
      name: "Control CLI API session query preserves invalid bearer rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-load-session.v1",
          "invalid_session",
        ),
    },
    {
      name: "Control CLI API session query preserves session_expired rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-load-session.v1",
          "session_expired",
        ),
    },
    {
      name: "Control CLI API session query re-evaluates current Control authority",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlFailureCode(
          "control.cli-auth-api-load-session.v1",
          "control_access_unavailable",
        )

        const revokeSession = vi.fn(async () => ({
          kind: "success" as const,
          value: { revoked: true as const },
        }))
        const identityId = "22222222-2222-4222-8222-222222222222"
        const cell = makeControlCliAuthApiLoadSessionCell({
          loadSession: {
            execute: async () => ({
              kind: "success" as const,
              value: {
                principal: {
                  identityId,
                  kind: "human" as const,
                  displayName: "Former Owner",
                  sessionId: "33333333-3333-4333-8333-333333333333",
                  sessionIssuedAt: new Date("2026-08-24T12:00:00.000Z"),
                  sessionExpiresAt: new Date("2026-08-25T12:00:00.000Z"),
                },
                principalAttributes: {
                  assignments: [],
                  identityActive: true,
                  assuranceLevel: "mfa" as const,
                },
              },
            }),
          },
          revokeSession: { execute: revokeSession },
          resolveIdentityAccess: async () => null,
        })

        await expect(
          cell.execute({ bearerToken: "stale-control-cli-token" }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "control_access_unavailable" },
        })
        expect(revokeSession).toHaveBeenCalledTimes(1)
        expect(revokeSession).toHaveBeenCalledWith({
          bearerToken: "stale-control-cli-token",
        })
      },
    },
  ],
})
