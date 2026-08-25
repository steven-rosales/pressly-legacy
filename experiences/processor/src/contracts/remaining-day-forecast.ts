import {
  productionForecastExpectedLaterItemSchema,
  productionForecastInProductionItemSchema,
  productionForecastNeedsShiftItemSchema,
  productionForecastReadyToPlaceItemSchema,
  productionRemainingDayForecastSchema,
} from "@pressly/production-system/contracts/queries/load-remaining-day-forecast"
import { z } from "zod"

import { processorOperationalOrderIdentitySchema } from "./operational-order.ts"

export const processorForecastInProductionItemSchema =
  productionForecastInProductionItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorForecastReadyToPlaceItemSchema =
  productionForecastReadyToPlaceItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorForecastExpectedLaterItemSchema =
  productionForecastExpectedLaterItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorForecastNeedsShiftItemSchema =
  productionForecastNeedsShiftItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorRemainingDayForecastSchema =
  productionRemainingDayForecastSchema
    .extend({
      groups: z
        .object({
          inProduction: z.array(processorForecastInProductionItemSchema),
          readyToPlace: z.array(processorForecastReadyToPlaceItemSchema),
          expectedLater: z.array(processorForecastExpectedLaterItemSchema),
          needsShift: z.array(processorForecastNeedsShiftItemSchema),
        })
        .strict(),
    })
    .strict()

export type ProcessorForecastInProductionItem = z.infer<
  typeof processorForecastInProductionItemSchema
>
export type ProcessorForecastReadyToPlaceItem = z.infer<
  typeof processorForecastReadyToPlaceItemSchema
>
export type ProcessorForecastExpectedLaterItem = z.infer<
  typeof processorForecastExpectedLaterItemSchema
>
export type ProcessorForecastNeedsShiftItem = z.infer<
  typeof processorForecastNeedsShiftItemSchema
>
export type ProcessorRemainingDayForecast = z.infer<
  typeof processorRemainingDayForecastSchema
>
