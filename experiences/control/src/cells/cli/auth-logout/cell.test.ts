import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthLogoutCellDeclaration } from "./cell.ts"
import { logoutSurface } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-logout.v1",
  declaration: adminCliAuthLogoutCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth logout preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(adminCliAuthLogoutCellDeclaration.contract.input.version).toBe(1)
        expect(adminCliAuthLogoutCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(adminCliAuthLogoutCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(adminCliAuthLogoutCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["auth", "logout"],
          arguments: [],
        })
        expect(logoutSurface.options.map(({ name }) => name)).toEqual([
          "json",
          "help",
        ])
        await expectControlOperationSuccess("control.cli-auth-logout.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-logout.v1",
          "diagnostic",
        )
      },
    },
  ],
})
