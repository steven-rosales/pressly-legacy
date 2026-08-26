import type { ProcessorRemainingDayForecast } from "../../../contracts/remaining-day-forecast.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { LoadProcessorRemainingDayForecastInput } from "./contract.ts"
import {
  loadProcessorRemainingDayForecastContract,
  loadProcessorRemainingDayForecastOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const loadProcessorRemainingDayForecastCellDeclaration = defineOperation<
  LoadProcessorRemainingDayForecastInput,
  ProcessorRemainingDayForecast,
  ProductionQueryFailure
>({
  kind: "query",
  id: loadProcessorRemainingDayForecastOperationId,
  authentication: "required",
  contract: loadProcessorRemainingDayForecastContract,
  authorization: {
    capability: "production:read",
    timing: "after-input",
    scope: (input) => input.locationId,
  },
  surfaces: [surface],
  observability: { operation: "processor.load_remaining_day_forecast" },
})
