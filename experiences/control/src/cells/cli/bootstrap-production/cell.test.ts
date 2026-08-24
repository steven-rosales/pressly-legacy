import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliProductionBootstrapCellDeclaration } from "./cell.ts"
import { productionBootstrapConcurrencyKey } from "./cell.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-bootstrap-production.v2",
  declaration: adminCliProductionBootstrapCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli bootstrap production preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliProductionBootstrapCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliProductionBootstrapCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliProductionBootstrapCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          adminCliProductionBootstrapCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "cli",
          name: ["bootstrap", "production"],
        })
        expect(
          adminCliProductionBootstrapCellDeclaration.consistency,
        ).toMatchObject({
          transaction: "none",
          concurrency: "partitioned",
        })
        expect(
          adminCliProductionBootstrapCellDeclaration.consistency.concurrencyKey?.(
            {
              file: "/tmp/production-bootstrap.json",
              actorId: "11111111-1111-4111-8111-111111111111",
              idempotencyKey: "bootstrap-test-1",
              dryRun: false,
            },
          ),
        ).toBe(productionBootstrapConcurrencyKey)
        await expectControlOperationSuccess(
          "control.cli-bootstrap-production.v2",
        )
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-bootstrap-production.v2",
          "diagnostic",
        )
      },
    },
  ],
})
