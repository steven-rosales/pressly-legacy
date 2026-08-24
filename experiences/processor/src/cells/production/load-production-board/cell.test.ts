import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { loadProcessorProductionBoardCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.load-production-board.v1",
  declaration: loadProcessorProductionBoardCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load production board preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          loadProcessorProductionBoardCellDeclaration.contract.input.version
        ).toBe(1)
        expect(
          loadProcessorProductionBoardCellDeclaration.contract.output.version
        ).toBe(1)
        expect(
          loadProcessorProductionBoardCellDeclaration.contract.failure.version
        ).toBe(1)
        expect(
          loadProcessorProductionBoardCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/runs/:productionRunId/board",
        })
        await expectProcessorOperationSuccess(
          "processor.load-production-board.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.load-production-board.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
