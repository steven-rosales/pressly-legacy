import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { loadProcessorProductionWorkspaceCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.load-production-workspace.v1",
  declaration: loadProcessorProductionWorkspaceCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load production workspace preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          loadProcessorProductionWorkspaceCellDeclaration.contract.input.version
        ).toBe(1)
        expect(
          loadProcessorProductionWorkspaceCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          loadProcessorProductionWorkspaceCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          loadProcessorProductionWorkspaceCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/workspace",
        })
        await expectProcessorOperationSuccess(
          "processor.load-production-workspace.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.load-production-workspace.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
