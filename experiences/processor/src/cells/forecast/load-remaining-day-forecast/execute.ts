import type { ProcessorRemainingDayForecast } from "../../../contracts/remaining-day-forecast.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { LoadProcessorRemainingDayForecastInput } from "./contract.ts"
import type { ProductionRemainingDayForecast } from "@pressly/production-system/contracts/queries/load-remaining-day-forecast"
import {
  orderDemandReferenceId,
  productionOrderReferenceId,
  requireOperationalOrder,
  resolveOperationalOrders,
} from "../../../server/model/operational-order.ts"
import { loadProcessorRemainingDayForecastCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type LoadRemainingDayForecast = ProductionQuery<
  LoadProcessorRemainingDayForecastInput,
  ProductionRemainingDayForecast
>

const referencesFor = (
  forecast: ProductionRemainingDayForecast
): readonly OperationalOrderReference[] =>
  [
    ...forecast.groups.inProduction,
    ...forecast.groups.readyToPlace,
    ...forecast.groups.expectedLater,
    ...forecast.groups.needsShift,
  ].map((item) => ({
    referenceId:
      item.productionOrderId === null
        ? orderDemandReferenceId(item.orderDemandId)
        : productionOrderReferenceId(item.productionOrderId),
    productionOrderId: item.productionOrderId,
    orderDemandId: item.orderDemandId,
    fallbackDisplayNumber: item.externalOrderId,
  }))

const project = async (
  forecast: ProductionRemainingDayForecast,
  resolve: ResolveOperationalOrderCanonical
): Promise<ProcessorRemainingDayForecast> => {
  const resolutions = await resolveOperationalOrders(
    resolve,
    referencesFor(forecast)
  )
  const identify = <
    Item extends {
      productionOrderId: string | null
      orderDemandId: string
    },
  >(
    item: Item
  ) => ({
    ...item,
    identity: requireOperationalOrder(
      resolutions,
      item.productionOrderId === null
        ? orderDemandReferenceId(item.orderDemandId)
        : productionOrderReferenceId(item.productionOrderId)
    ).identity,
  })
  return {
    ...forecast,
    groups: {
      inProduction: forecast.groups.inProduction.map(identify),
      readyToPlace: forecast.groups.readyToPlace.map(identify),
      expectedLater: forecast.groups.expectedLater.map(identify),
      needsShift: forecast.groups.needsShift.map(identify),
    },
  }
}

export const makeLoadProcessorRemainingDayForecastCell = (dependencies: {
  loadForecast: LoadRemainingDayForecast
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  defineOperation(
    loadProcessorRemainingDayForecastCellDeclaration,
    async (input) => {
      const forecast = await dependencies.loadForecast(input)
      return forecast.kind === "failure"
        ? productionQueryFailureOutcome(forecast.failure)
        : {
            kind: "success",
            value: await project(
              forecast.value,
              dependencies.resolveOrderCanonical
            ),
          }
    }
  )
