import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listProcessorProductionOrderControlCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.list-production-order-control.v1",
  declaration: listProcessorProductionOrderControlCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list production order control preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          listProcessorProductionOrderControlCellDeclaration.contract.input
            .version
        ).toBe(1)
        expect(
          listProcessorProductionOrderControlCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          listProcessorProductionOrderControlCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          listProcessorProductionOrderControlCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/order-control",
        })
        await expectProcessorOperationSuccess(
          "processor.list-production-order-control.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.list-production-order-control.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
