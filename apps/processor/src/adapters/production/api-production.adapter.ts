import {
  acceptScheduleResultSchema,
  listProductionLocationsResultSchema,
  listProductionOrdersResultSchema,
  productionBoardSchema,
  productionMutationResultSchema,
  productionWorkspaceSchema,
  recordOrderIntakeResultSchema,
  productionShiftSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
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
  loadWorkspace: (locationId) =>
    request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/workspace`,
      },
      productionWorkspaceSchema
    ),
  listOrders: ({ locationId, cursor, limit = 100 }) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor !== undefined) query.set("cursor", cursor)
    return request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/orders?${query.toString()}`,
      },
      listProductionOrdersResultSchema
    )
  },
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
  loadBoard: (locationId, productionShiftId) =>
    request(
      {
        path: `/production/locations/${encodeURIComponent(locationId)}/shifts/${encodeURIComponent(productionShiftId)}/board`,
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
  startRun: ({ locationId, productionRunId, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/runs/${encodeURIComponent(productionRunId)}/start`,
        body,
      },
      productionMutationResultSchema
    ),
  advanceStage: ({ locationId, stageRunId, transition, ...body }) =>
    request(
      {
        method: "POST",
        path: `/production/locations/${encodeURIComponent(locationId)}/stages/${encodeURIComponent(stageRunId)}/${encodeURIComponent(transition)}`,
        body,
      },
      productionMutationResultSchema
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
