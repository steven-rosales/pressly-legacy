import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCliAuthApiBeginMfaEnrollmentCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiBeginMfaEnrollmentCell } from "./execute.ts"
import { controlCliAuthApiBeginMfaEnrollmentSurface } from "./http.ts"

const identityId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const requestId = "cli-auth-api-begin-mfa-request"

proveOperation({
  operationId: "control.cli-auth-api-begin-mfa-enrollment.v1",
  declaration: controlCliAuthApiBeginMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api begin mfa enrollment preserves its contract, protocol, context, and successful Access execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiBeginMfaEnrollmentCellDeclaration.contract.input
            .version,
        ).toBe(1)
        expect(
          controlCliAuthApiBeginMfaEnrollmentCellDeclaration.contract.output
            .version,
        ).toBe(1)
        expect(
          controlCliAuthApiBeginMfaEnrollmentCellDeclaration.contract.failure
            .version,
        ).toBe(1)
        expect(controlCliAuthApiBeginMfaEnrollmentSurface).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/mfa/enrollment",
          contextRequirements: ["authenticated-principal", "request-metadata"],
        })
        expect(
          controlCliAuthApiBeginMfaEnrollmentSurface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: {},
            context: {
              principal: { identityId, sessionId, label: "Owner" },
              requestMetadata: { requestId },
            },
          }),
        ).toEqual({ identityId, label: "Owner", requestId })

        let received: unknown
        const cell = makeControlCliAuthApiBeginMfaEnrollmentCell({
          execute: async (input) => {
            received = input
            return {
              kind: "success" as const,
              value: {
                secret: "a".repeat(32),
                enrollmentUri: "otpauth://totp/Pressly:Owner",
              },
            }
          },
        })

        await expect(
          cell.execute({ identityId, label: "Owner", requestId }),
        ).resolves.toMatchObject({ kind: "success" })
        expect(received).toEqual({ identityId, label: "Owner", requestId })
      },
    },
  ],
})

proveOperation({
  operationId: "control.cli-auth-api-begin-mfa-enrollment.v1",
  declaration: controlCliAuthApiBeginMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api begin mfa enrollment preserves mfa_already_enabled from Access",
      proves: ["executor-success"],
      run: async () => {
        const cell = makeControlCliAuthApiBeginMfaEnrollmentCell({
          execute: async () => ({
            kind: "failure" as const,
            failure: {
              kind: "conflict" as const,
              code: "mfa_already_enabled" as const,
              message: "MFA is already enabled.",
            },
          }),
        })

        await expect(
          cell.execute({ identityId, label: "Owner" }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "mfa_already_enabled" },
        })
      },
    },
  ],
})
