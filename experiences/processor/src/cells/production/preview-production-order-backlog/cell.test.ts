import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { previewProcessorProductionOrderBacklogCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.preview-production-order-backlog.v1",
  declaration: previewProcessorProductionOrderBacklogCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "preview production order backlog preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          previewProcessorProductionOrderBacklogCellDeclaration.contract.input
            .version
        ).toBe(1)
        expect(
          previewProcessorProductionOrderBacklogCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          previewProcessorProductionOrderBacklogCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          previewProcessorProductionOrderBacklogCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/production/locations/:locationId/order-backlog/preview",
        })
        await expectProcessorOperationSuccess(
          "processor.preview-production-order-backlog.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.preview-production-order-backlog.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
