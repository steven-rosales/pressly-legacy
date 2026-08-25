import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthSessionCellDeclaration } from "./cell.ts"
import { sessionSurface } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-session.v1",
  declaration: adminCliAuthSessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth session preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(adminCliAuthSessionCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(adminCliAuthSessionCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(
          adminCliAuthSessionCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliAuthSessionCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["auth", "session"],
          arguments: [],
        })
        expect(sessionSurface.options.map(({ name }) => name)).toEqual([
          "json",
          "help",
        ])
        await expectControlOperationSuccess("control.cli-auth-session.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-session.v1",
          "diagnostic",
        )
      },
    },
  ],
})
