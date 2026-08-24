import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCliAuthApiConfirmMfaEnrollmentCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiConfirmMfaEnrollmentCell } from "./execute.ts"
import { controlCliAuthApiConfirmMfaEnrollmentSurface } from "./http.ts"

const identityId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const requestId = "cli-auth-api-confirm-mfa-request"

proveOperation({
  operationId: "control.cli-auth-api-confirm-mfa-enrollment.v1",
  declaration: controlCliAuthApiConfirmMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api confirm mfa enrollment preserves its contract, protocol, context, and successful Access execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiConfirmMfaEnrollmentCellDeclaration.contract.input
            .version,
        ).toBe(1)
        expect(
          controlCliAuthApiConfirmMfaEnrollmentCellDeclaration.contract.output
            .version,
        ).toBe(1)
        expect(
          controlCliAuthApiConfirmMfaEnrollmentCellDeclaration.contract.failure
            .version,
        ).toBe(1)
        expect(controlCliAuthApiConfirmMfaEnrollmentSurface).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/mfa/enrollment/confirm",
          contextRequirements: ["authenticated-principal", "request-metadata"],
        })
        expect(
          controlCliAuthApiConfirmMfaEnrollmentSurface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: { code: "123456" },
            context: {
              principal: { identityId, sessionId, label: "Owner" },
              requestMetadata: { requestId },
            },
          }),
        ).toEqual({ identityId, sessionId, code: "123456", requestId })

        let received: unknown
        const cell = makeControlCliAuthApiConfirmMfaEnrollmentCell({
          execute: async (input) => {
            received = input
            return {
              kind: "success" as const,
              value: { recoveryCodes: ["recovery-code"] },
            }
          },
        })

        await expect(
          cell.execute({ identityId, sessionId, code: "123456", requestId }),
        ).resolves.toEqual({
          kind: "success",
          value: { recoveryCodes: ["recovery-code"] },
        })
        expect(received).toEqual({
          identityId,
          sessionId,
          code: "123456",
          requestId,
        })
      },
    },
  ],
})

proveOperation({
  operationId: "control.cli-auth-api-confirm-mfa-enrollment.v1",
  declaration: controlCliAuthApiConfirmMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api confirm mfa enrollment preserves invalid_mfa_code from Access",
      proves: ["executor-success"],
      run: async () => {
        const cell = makeControlCliAuthApiConfirmMfaEnrollmentCell({
          execute: async () => ({
            kind: "failure" as const,
            failure: {
              kind: "authentication" as const,
              code: "invalid_mfa_code" as const,
              message: "The MFA code is invalid.",
            },
          }),
        })

        await expect(
          cell.execute({ identityId, sessionId, code: "123456" }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "invalid_mfa_code" },
        })
      },
    },
    {
      name: "cli auth api confirm mfa enrollment preserves mfa_enrollment_missing from Access",
      proves: ["executor-success"],
      run: async () => {
        const cell = makeControlCliAuthApiConfirmMfaEnrollmentCell({
          execute: async () => ({
            kind: "failure" as const,
            failure: {
              kind: "conflict" as const,
              code: "mfa_enrollment_missing" as const,
              message: "MFA enrollment is missing.",
            },
          }),
        })

        await expect(
          cell.execute({ identityId, sessionId, code: "123456" }),
        ).resolves.toMatchObject({
          kind: "failure",
          failure: { code: "mfa_enrollment_missing" },
        })
      },
    },
  ],
})
