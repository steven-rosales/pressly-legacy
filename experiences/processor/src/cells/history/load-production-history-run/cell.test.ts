import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { loadProcessorProductionHistoryRunCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.load-production-history-run.v1",
  declaration: loadProcessorProductionHistoryRunCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load production history run preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          loadProcessorProductionHistoryRunCellDeclaration.contract.input
            .version
        ).toBe(1)
        expect(
          loadProcessorProductionHistoryRunCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          loadProcessorProductionHistoryRunCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          loadProcessorProductionHistoryRunCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/history/runs/:productionRunId",
        })
        await expectProcessorOperationSuccess(
          "processor.load-production-history-run.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.load-production-history-run.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
