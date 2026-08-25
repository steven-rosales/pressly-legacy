import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listProcessorProductionHistoryActivityCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.list-production-history-activity.v1",
  declaration: listProcessorProductionHistoryActivityCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list production history activity preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          listProcessorProductionHistoryActivityCellDeclaration.contract.input
            .version
        ).toBe(1)
        expect(
          listProcessorProductionHistoryActivityCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          listProcessorProductionHistoryActivityCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          listProcessorProductionHistoryActivityCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/history/activity",
        })
        await expectProcessorOperationSuccess(
          "processor.list-production-history-activity.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.list-production-history-activity.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
