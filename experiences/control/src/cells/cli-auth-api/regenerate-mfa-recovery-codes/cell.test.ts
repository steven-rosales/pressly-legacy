import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiRegenerateMfaRecoveryCodesCell } from "./execute.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesSurface } from "./http.ts"

const identityId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const requestId = "cli-auth-api-regenerate-mfa-request"

proveOperation({
  operationId: "control.cli-auth-api-regenerate-mfa-recovery-codes.v1",
  declaration: controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api recovery-code regeneration preserves its contract, protocol, context, and successful Access execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration.contract
            .input.version,
        ).toBe(1)
        expect(
          controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration.contract
            .output.version,
        ).toBe(1)
        expect(
          controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration.contract
            .failure.version,
        ).toBe(1)
        expect(
          controlCliAuthApiRegenerateMfaRecoveryCodesSurface,
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/mfa/recovery-codes/regenerate",
          contextRequirements: ["authenticated-principal", "request-metadata"],
        })
        expect(
          controlCliAuthApiRegenerateMfaRecoveryCodesSurface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: {},
            context: {
              principal: { identityId, sessionId, label: "Owner" },
              requestMetadata: { requestId },
            },
          }),
        ).toEqual({ identityId, requestId })

        let received: unknown
        const cell = makeControlCliAuthApiRegenerateMfaRecoveryCodesCell({
          execute: async (input) => {
            received = input
            return {
              kind: "success" as const,
              value: { recoveryCodes: ["recovery-code"] },
            }
          },
        })

        await expect(cell.execute({ identityId, requestId })).resolves.toEqual({
          kind: "success",
          value: { recoveryCodes: ["recovery-code"] },
        })
        expect(received).toEqual({ identityId, requestId })
      },
    },
  ],
})
