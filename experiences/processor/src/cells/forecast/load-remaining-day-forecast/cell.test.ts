import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { loadProcessorRemainingDayForecastCellDeclaration } from "./cell.ts"

import {
  expectProcessorOperationSuccess,
  expectProcessorProductionQueryFailure,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.load-remaining-day-forecast.v1",
  declaration: loadProcessorRemainingDayForecastCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load remaining day forecast preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          loadProcessorRemainingDayForecastCellDeclaration.contract.input
            .version
        ).toBe(1)
        expect(
          loadProcessorRemainingDayForecastCellDeclaration.contract.output
            .version
        ).toBe(1)
        expect(
          loadProcessorRemainingDayForecastCellDeclaration.contract.failure
            .version
        ).toBe(1)
        expect(
          loadProcessorRemainingDayForecastCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/production/locations/:locationId/forecast",
        })
        await expectProcessorOperationSuccess(
          "processor.load-remaining-day-forecast.v1"
        )
      },
    },
    {
      name: "preserves arbitrary upstream diagnostics under a finite query-failure reason",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectProcessorProductionQueryFailure(
          "processor.load-remaining-day-forecast.v1",
          "upstream_production_query_failed"
        )
      },
    },
  ],
})
