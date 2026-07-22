import {
  acceptScheduleResultSchema,
  advanceProductionStageResultSchema,
  automaticProductionOrderPlacementResultSchema,
  confirmProductionOrderOvertimeResultSchema,
  exactProductionOrderPlacementResultSchema,
  commitProductionOrderRouteResultSchema,
  listProductionHistoryActivityResultSchema,
  listProductionHistoryPlansResultSchema,
  listProductionHistoryRunsResultSchema,
  listProcessorOrderControlResultSchema,
  productionBatchMembershipMutationResultSchema,
  productionBatchProgressReconciliationResultSchema,
  listProductionLocationsResultSchema,
  listProductionOrdersResultSchema,
  productionBoardSchema,
  productionMutationResultSchema,
  productionHistoryRunDetailSchema,
  productionOrderRouteProposalSchema,
  productionWorkspaceSchema,
  recordOrderIntakeResultSchema,
  replaceProductionShiftSelectionResultSchema,
  productionShiftSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
  startScheduleResultSchema,
  updateProductionShiftResultSchema,
} from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { RequestPort } from "@/ports/request.port"

export const makeApiProductionAdapter = (
  request: RequestPort
): ProductionPort => ({
  listLocations: () =>
    request(
      { path: "/production/locations" },
      listProductionLocationsResultSchema
    ),
  loadWorkspace: (locationId, shiftId, signal) => {
    const query = new URLSearchParams()
    if (shiftId !== undefined) query.set("shiftId", shiftId)
    const suffix = query.size === 0 ? "" : `?${query.toString()}`
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/workspace${suffix}`,
        ...(signal === undefined ? {} : { signal }),
      },
      productionWorkspaceSchema
    )
  },
  listOrders: ({ locationId, cursor, limit = 100, signal }) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor !== undefined) query.set("cursor", cursor)
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/orders?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionOrdersResultSchema
    )
  },
  listOrderControl: ({ locationId, query: input, signal }) => {
    const query = new URLSearchParams()
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value))
    })
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/order-control?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProcessorOrderControlResultSchema
    )
  },
  previewOrderRoute: ({
    locationId,
    productionRunId,
    productionOrderId,
    request: body,
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/orders/${encodeURIComponent(productionOrderId)}/route/preview`,
        body,
      },
      productionOrderRouteProposalSchema
    ),
  commitOrderRoute: ({
    locationId,
    productionRunId,
    productionOrderId,
    request: body,
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/orders/${encodeURIComponent(productionOrderId)}/route`,
        body,
      },
      commitProductionOrderRouteResultSchema
    ),
  listHistoryRuns: ({ locationId, query: input, signal }) => {
    const query = new URLSearchParams()
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value))
    })
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/history/runs?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionHistoryRunsResultSchema
    )
  },
  listHistoryActivity: ({ locationId, query: input, signal }) => {
    const query = new URLSearchParams()
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value))
    })
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/history/activity?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionHistoryActivityResultSchema
    )
  },
  listHistoryPlans: ({ locationId, query: input, signal }) => {
    const query = new URLSearchParams()
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value))
    })
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/history/plans?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionHistoryPlansResultSchema
    )
  },
  loadHistoryRun: (locationId, productionRunId, signal) =>
    request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/history/runs/${encodeURIComponent(productionRunId)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      productionHistoryRunDetailSchema
    ),
  recordIntake: ({ locationId, productionOrderId, ...body }) =>
    request(
      {
        method: "PUT",
        path: `/production/locations/${encodeURIComponent(locationId)}/orders/${encodeURIComponent(productionOrderId)}/intake`,
        body,
      },
      recordOrderIntakeResultSchema
    ),
  publishConfig: ({ locationId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/scheduler-configs`,
        body,
      },
      schedulerConfigSchema
    ),
  createShift: ({ locationId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/shifts`,
        body,
      },
      productionShiftSchema
    ),
  updateShift: ({ locationId, productionShiftId, ...body }) =>
    request(
      {
        method: "PATCH",
        path: `/production/locations/${encodeURIComponent(locationId)}/shifts/${encodeURIComponent(productionShiftId)}`,
        body,
      },
      updateProductionShiftResultSchema
    ),
  replaceShiftSelection: ({ locationId, productionShiftId, ...body }) =>
    request(
      {
        method: "PUT",
        path: `/production/locations/${encodeURIComponent(locationId)}/shifts/${encodeURIComponent(productionShiftId)}/selection`,
        body,
      },
      replaceProductionShiftSelectionResultSchema
    ),
  createSchedule: ({ locationId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/schedules`,
        body,
      },
      scheduleProposalSchema
    ),
  loadSchedule: (locationId, scheduleRunId) =>
    request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/schedules/${encodeURIComponent(scheduleRunId)}`,
      },
      scheduleProposalSchema
    ),
  acceptSchedule: ({ locationId, scheduleRunId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/schedules/${encodeURIComponent(scheduleRunId)}/accept`,
        body,
      },
      acceptScheduleResultSchema
    ),
  startSchedule: ({ locationId, scheduleRunId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/schedules/${encodeURIComponent(scheduleRunId)}/start`,
        body,
      },
      startScheduleResultSchema
    ),
  loadBoard: (locationId, productionRunId, signal) =>
    request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/board`,
        ...(signal === undefined ? {} : { signal }),
      },
      productionBoardSchema
    ),
  setPriority: ({ locationId, productionOrderId, ...body }) =>
    request(
      {
        method: "PATCH",
        path: `/production/locations/${encodeURIComponent(locationId)}/orders/${encodeURIComponent(productionOrderId)}/priority`,
        body,
      },
      productionMutationResultSchema
    ),
  freezeBatch: ({ locationId, productionRunId, productionBatchId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/batches/${encodeURIComponent(productionBatchId)}/freeze`,
        body,
      },
      productionBatchMembershipMutationResultSchema
    ),
  unfreezeBatch: ({
    locationId,
    productionRunId,
    productionBatchId,
    ...body
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/batches/${encodeURIComponent(productionBatchId)}/unfreeze`,
        body,
      },
      productionBatchMembershipMutationResultSchema
    ),
  retryAutomaticPlacement: ({
    locationId,
    productionRunId,
    productionOrderId,
    ...body
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/orders/${encodeURIComponent(productionOrderId)}/place`,
        body,
      },
      automaticProductionOrderPlacementResultSchema
    ),
  placeOrderExactly: ({
    locationId,
    productionRunId,
    productionOrderId,
    productionBatchId,
    ...body
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/batches/${encodeURIComponent(productionBatchId)}/orders/${encodeURIComponent(productionOrderId)}/place`,
        body,
      },
      exactProductionOrderPlacementResultSchema
    ),
  confirmPlacementOvertime: ({
    locationId,
    productionRunId,
    productionOrderId,
    ...body
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/orders/${encodeURIComponent(productionOrderId)}/confirm-overtime`,
        body,
      },
      confirmProductionOrderOvertimeResultSchema
    ),
  reconcileBatchProgress: ({
    locationId,
    productionRunId,
    productionBatchId,
    ...body
  }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/batches/${encodeURIComponent(productionBatchId)}/progress-reconciliation`,
        body,
      },
      productionBatchProgressReconciliationResultSchema
    ),
  advanceStage: ({ locationId, stageRunId, transition, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/stages/${encodeURIComponent(stageRunId)}/${encodeURIComponent(transition)}`,
        body,
      },
      advanceProductionStageResultSchema
    ),
  assignStageMachines: ({ locationId, stageRunId, ...body }) =>
    request(
      {
        method: "PUT",
        path: `/production/locations/${encodeURIComponent(locationId)}/stages/${encodeURIComponent(stageRunId)}/machines`,
        body,
      },
      productionMutationResultSchema
    ),
})
