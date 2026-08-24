import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect, vi } from "vitest"
import { controlCliAuthApiCompleteMfaChallengeCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiCompleteMfaChallengeCell } from "./execute.ts"
import {
  expectControlFailureCode,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-api-complete-mfa-challenge.v1",
  declaration: controlCliAuthApiCompleteMfaChallengeCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "Control CLI API MFA challenge declares its bearer realm and establishes an owner session",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiCompleteMfaChallengeCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/mfa/challenge",
        })
        await expectControlOperationSuccess(
          "control.cli-auth-api-complete-mfa-challenge.v1",
        )
      },
    },
    {
      name: "Control CLI API MFA challenge preserves invalid_mfa_challenge rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-complete-mfa-challenge.v1",
          "invalid_mfa_challenge",
        ),
    },
    {
      name: "Control CLI API MFA challenge preserves expired_mfa_challenge rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-complete-mfa-challenge.v1",
          "expired_mfa_challenge",
        ),
    },
    {
      name: "Control CLI API MFA challenge preserves invalid_mfa_code rejection",
      proves: ["expected-rejection-no-partial-write"],
      run: () =>
        expectControlFailureCode(
          "control.cli-auth-api-complete-mfa-challenge.v1",
          "invalid_mfa_code",
        ),
    },
    {
      name: "Control CLI API MFA challenge revokes authority outside Control",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlFailureCode(
          "control.cli-auth-api-complete-mfa-challenge.v1",
          "control_access_unavailable",
        )

        const revokeSession = vi.fn(async () => ({
          kind: "success" as const,
          value: { revoked: true as const },
        }))
        const identityId = "22222222-2222-4222-8222-222222222222"
        const expiresAt = new Date("2026-08-25T12:00:00.000Z")
        const cell = makeControlCliAuthApiCompleteMfaChallengeCell({
          completeMfaChallenge: {
            execute: async () => ({
              kind: "success" as const,
              value: {
                accessToken: "newly-issued-mfa-control-cli-token",
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
                  assuranceLevel: "mfa" as const,
                },
              },
            }),
          },
          revokeSession: { execute: revokeSession },
          resolveIdentityAccess: async () => null,
        })

        await expect(
          cell.execute({
            challengeToken: "challenge-token",
            method: "totp",
            code: "123456",
            requestId: "cli-mfa-denied-request",
          }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "control_access_unavailable" },
        })
        expect(revokeSession).toHaveBeenCalledTimes(1)
        expect(revokeSession).toHaveBeenCalledWith({
          bearerToken: "newly-issued-mfa-control-cli-token",
          requestId: "cli-mfa-denied-request",
        })
      },
    },
  ],
})
