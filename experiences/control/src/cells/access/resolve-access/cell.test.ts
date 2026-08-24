import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { resolveControlAccessCellDeclaration } from "./cell.ts"
import { resolveControlAccessProtocol } from "./protocol.ts"
import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.resolve-access.v1",
  declaration: resolveControlAccessCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "resolve access preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(resolveControlAccessCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(
          resolveControlAccessCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          resolveControlAccessCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(resolveControlAccessCellDeclaration.surfaces).toEqual([])
        expect(resolveControlAccessProtocol).toEqual({
          kind: "internal-query",
          authentication: "required",
        })
        await expectControlOperationSuccess("control.resolve-access.v1")
      },
    },
  ],
})
