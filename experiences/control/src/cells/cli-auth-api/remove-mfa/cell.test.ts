import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCliAuthApiRemoveMfaCellDeclaration } from "./cell.ts"
import { makeControlCliAuthApiRemoveMfaCell } from "./execute.ts"
import { controlCliAuthApiRemoveMfaSurface } from "./http.ts"

const identityId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const requestId = "cli-auth-api-remove-mfa-request"

proveOperation({
  operationId: "control.cli-auth-api-remove-mfa.v1",
  declaration: controlCliAuthApiRemoveMfaCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth api mfa removal preserves its contract, protocol, context, and successful Access execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiRemoveMfaCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlCliAuthApiRemoveMfaCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlCliAuthApiRemoveMfaCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(controlCliAuthApiRemoveMfaSurface).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/mfa/remove",
          contextRequirements: ["authenticated-principal", "request-metadata"],
        })
        expect(
          controlCliAuthApiRemoveMfaSurface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: {},
            context: {
              principal: { identityId, sessionId, label: "Owner" },
              requestMetadata: { requestId },
            },
          }),
        ).toEqual({ identityId, sessionId, requestId })

        let received: unknown
        const cell = makeControlCliAuthApiRemoveMfaCell({
          execute: async (input) => {
            received = input
            return {
              kind: "success" as const,
              value: { updated: true as const },
            }
          },
        })

        await expect(
          cell.execute({ identityId, sessionId, requestId }),
        ).resolves.toEqual({ kind: "success", value: { updated: true } })
        expect(received).toEqual({ identityId, sessionId, requestId })
      },
    },
  ],
})
