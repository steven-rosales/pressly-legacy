import type {
  FiniteCellSurface,
  HttpRequestInput,
  HttpSurface,
} from "@pressly/cells"
import { listProcessorOrderControlResultSchema } from "../../src/contracts/production-order-control.ts"
import {
  processorListProductionHistoryActivityResultSchema,
  processorProductionHistoryRunDetailSchema,
} from "../../src/contracts/production-history.ts"
import { processorProductionBoardSchema } from "../../src/contracts/production-board.ts"
import { processorProductionOrderBacklogPreviewSchema } from "../../src/contracts/production-order-backlog.ts"
import { processorProductionWorkspaceSchema } from "../../src/contracts/production-workspace.ts"
import { processorRemainingDayForecastSchema } from "../../src/contracts/remaining-day-forecast.ts"
import { isAppError, normalizeUnknownError } from "@pressly/errors/app-error"
import {
  databaseError,
  invariantViolationError,
} from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  listProcessorProductionHistoryActivityCellDeclaration,
  listProcessorProductionOrderControlCellDeclaration,
  loadProcessorProductionBoardCellDeclaration,
  loadProcessorProductionHistoryRunCellDeclaration,
  loadProcessorProductionWorkspaceCellDeclaration,
  loadProcessorRemainingDayForecastCellDeclaration,
  makeLoadProcessorProductionBoardCell,
  makeProcessorServerExperience,
  previewProcessorProductionOrderBacklogCellDeclaration,
  type OperationalOrderCanonical,
  type OperationalOrderReference,
  type ProcessorServerDependencies,
  type ProductionQueryFailure,
} from "../../src/server.ts"
import {
  historyActivityFixture,
  historyRunFixture,
  orderBacklogPreviewFixture,
  orderControlFixture,
  productionBoardFixture,
  productionWorkspaceFixture,
  remainingDayForecastFixture,
  serverFixtureIds as ids,
  serverFixtureLocationId as locationId,
  serverFixtureNow,
} from "./fixtures.ts"

const canonical = (): OperationalOrderCanonical => ({
  canonicalOrderId: ids.canonicalOrder,
  canonicalFulfillmentId: ids.fulfillment,
  displayNumber: null,
  customer: {
    resolution: "resolved",
    userId: null,
    firstName: "Casey",
    lastName: "Operator",
    businessName: null,
    phone: null,
  },
  commercialState: "open",
  admissionState: "released",
  versions: { order: 2, fulfillment: 3 },
})

const success = <Value>(value: Value) =>
  Promise.resolve({ kind: "success" as const, value })

const makeDependencies = () => {
  const resolveOrderCanonical = vi.fn(
    async (references: readonly OperationalOrderReference[]) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          reference.productionOrderId === null ? null : canonical(),
        ])
      )
  )
  const loadOrderAudit = vi.fn(async () => ({
    sources: [
      {
        canonicalOrderId: ids.canonicalOrder,
        name: "cents",
        observedAt: new Date("2026-08-22T15:00:00.000Z"),
      },
    ],
    orderCommands: [
      {
        canonicalOrderId: ids.canonicalOrder,
        code: "order_created",
        actorId: ids.actor,
        occurredAt: new Date("2026-08-22T14:00:00.000Z"),
      },
    ],
    productionCommands: Array.from({ length: 8 }, (_, index) => ({
      productionOrderId: ids.order,
      code: `production-${String(index)}`,
      actorId: ids.actor,
      occurredAt: new Date(Date.parse(serverFixtureNow) - index * 60_000),
    })),
  }))
  const production: ProcessorServerDependencies["production"] = {
    loadBoard: vi.fn(async () => success(productionBoardFixture())),
    previewOrderBacklog: vi.fn(async () =>
      success(orderBacklogPreviewFixture())
    ),
    loadWorkspace: vi.fn(async () => success(productionWorkspaceFixture())),
    loadRemainingDayForecast: vi.fn(async () =>
      success(remainingDayForecastFixture())
    ),
    listHistoryActivity: vi.fn(async () => success(historyActivityFixture())),
    loadHistoryRun: vi.fn(async () => success(historyRunFixture())),
    listOrderControl: vi.fn(async () => success(orderControlFixture())),
  }
  return { production, resolveOrderCanonical, loadOrderAudit }
}

const request = (input: {
  params?: Readonly<Record<string, string | undefined>>
  query?: unknown
  body?: unknown
}): HttpRequestInput => ({
  params: input.params ?? {},
  query: input.query ?? {},
  body: input.body,
  headers: {},
})

const typedFailure: ProductionQueryFailure = {
  tag: "ProductionFailure",
  reason: "upstream_production_query_failed",
  kind: "not_found",
  code: "production_location_not_found",
  message: "The production location was not found.",
  safeMessage: "The production location was not found.",
}

const requireHttpSurface = <Output, Failure>(
  surface: FiniteCellSurface<Output, Failure> | undefined
): HttpSurface<Output, Failure> => {
  if (surface === undefined || surface.kind !== "http")
    throw invariantViolationError({
      code: "processor_server_test_http_surface_missing",
      message: "The Processor server test expected one HTTP surface.",
    })
  return surface
}

describe("Processor server Experience query cells", () => {
  it("declares seven distinct authenticated routes with exact staged authorization", () => {
    const declarations = [
      loadProcessorProductionBoardCellDeclaration,
      previewProcessorProductionOrderBacklogCellDeclaration,
      loadProcessorProductionWorkspaceCellDeclaration,
      loadProcessorRemainingDayForecastCellDeclaration,
      listProcessorProductionHistoryActivityCellDeclaration,
      loadProcessorProductionHistoryRunCellDeclaration,
      listProcessorProductionOrderControlCellDeclaration,
    ]
    expect(declarations.map(({ id }) => id)).toEqual([
      "processor.load-production-board.v1",
      "processor.preview-production-order-backlog.v1",
      "processor.load-production-workspace.v1",
      "processor.load-remaining-day-forecast.v1",
      "processor.list-production-history-activity.v1",
      "processor.load-production-history-run.v1",
      "processor.list-production-order-control.v1",
    ])
    expect(
      declarations.map(({ surfaces }) => {
        const surface = surfaces[0]
        return surface?.kind === "http"
          ? `${surface.method} ${surface.path}`
          : null
      })
    ).toEqual([
      "GET /production/locations/:locationId/runs/:productionRunId/board",
      "POST /production/locations/:locationId/order-backlog/preview",
      "GET /production/locations/:locationId/workspace",
      "GET /production/locations/:locationId/forecast",
      "GET /production/locations/:locationId/history/activity",
      "GET /production/locations/:locationId/history/runs/:productionRunId",
      "GET /production/locations/:locationId/order-control",
    ])
    expect(declarations.map(({ authentication }) => authentication)).toEqual(
      Array.from({ length: 7 }, () => "required")
    )
    expect(
      declarations.map(({ authorization }) => ({
        capability: authorization?.capability,
        timing: authorization?.timing,
      }))
    ).toEqual([
      { capability: "production:read", timing: "after-input" },
      { capability: "production:override", timing: "after-input" },
      { capability: "production:read", timing: "after-input" },
      { capability: "production:read", timing: "after-input" },
      { capability: "production:read", timing: "after-input" },
      { capability: "production:read", timing: "after-input" },
      { capability: "production:read", timing: "after-input" },
    ])
    expect(
      previewProcessorProductionOrderBacklogCellDeclaration.surfaces[0]
    ).toMatchObject({ bodyLimit: "64kb" })
  })

  it("projects all seven canonical Production results through identity and audit ports", async () => {
    const dependencies = makeDependencies()
    const server = makeProcessorServerExperience(dependencies)

    dependencies.resolveOrderCanonical.mockClear()
    const board = await server.cells.loadBoard.execute({
      locationId,
      productionRunId: ids.run,
    })
    expect(board.kind).toBe("success")
    if (board.kind === "success") {
      expect(processorProductionBoardSchema.parse(board.value)).toEqual(
        board.value
      )
      expect(board.value.batches[0]?.orders[0]?.identity).toEqual({
        displayNumber: "ORDER-FALLBACK",
        customerDisplayName: "Casey Operator",
      })
    }
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]).toHaveLength(
      1
    )
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]?.[0]).toEqual({
      referenceId: `production:${ids.order}`,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: "ORDER-FALLBACK",
    })

    dependencies.resolveOrderCanonical.mockClear()
    const backlog = await server.cells.previewOrderBacklog.execute({
      locationId,
      filter: "all_due_before_cutoff",
      cutoff: "2026-08-01T00:00:00.000Z",
      reason: "processor_not_in_use",
      cursor: null,
      maxOrders: 250,
    })
    expect(backlog.kind).toBe("success")
    if (backlog.kind === "success")
      expect(
        processorProductionOrderBacklogPreviewSchema.parse(backlog.value)
      ).toEqual(backlog.value)
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]?.[0]).toEqual(
      expect.objectContaining({
        referenceId: `production:${ids.order}`,
        fallbackDisplayNumber: "ORDER-FALLBACK",
      })
    )

    dependencies.resolveOrderCanonical.mockClear()
    const workspace = await server.cells.loadWorkspace.execute({ locationId })
    expect(workspace.kind).toBe("success")
    if (workspace.kind === "success")
      expect(processorProductionWorkspaceSchema.parse(workspace.value)).toEqual(
        workspace.value
      )
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]).toHaveLength(
      1
    )

    dependencies.resolveOrderCanonical.mockClear()
    const forecast = await server.cells.loadRemainingDayForecast.execute({
      locationId,
      serviceDay: "2026-08-22",
    })
    expect(forecast.kind).toBe("success")
    if (forecast.kind === "success") {
      expect(processorRemainingDayForecastSchema.parse(forecast.value)).toEqual(
        forecast.value
      )
      expect(forecast.value.groups.expectedLater[0]?.identity).toEqual({
        displayNumber: "DEMAND-FALLBACK",
        customerDisplayName: null,
      })
    }
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]?.[0]).toEqual({
      referenceId: `demand:${ids.demand}`,
      productionOrderId: null,
      orderDemandId: ids.demand,
      fallbackDisplayNumber: "DEMAND-FALLBACK",
    })

    dependencies.resolveOrderCanonical.mockClear()
    const activity = await server.cells.listHistoryActivity.execute({
      locationId,
      limit: 50,
    })
    expect(activity.kind).toBe("success")
    if (activity.kind === "success") {
      expect(
        processorListProductionHistoryActivityResultSchema.parse(activity.value)
      ).toEqual(activity.value)
      expect(activity.value.items.map(({ identity }) => identity)).toEqual([
        expect.objectContaining({ displayNumber: ids.order }),
        null,
      ])
    }
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]?.[0]).toEqual({
      referenceId: `production:${ids.order}`,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: ids.order,
    })

    dependencies.resolveOrderCanonical.mockClear()
    const historyRun = await server.cells.loadHistoryRun.execute({
      locationId,
      productionRunId: ids.run,
    })
    expect(historyRun.kind).toBe("success")
    if (historyRun.kind === "success")
      expect(
        processorProductionHistoryRunDetailSchema.parse(historyRun.value)
      ).toEqual(historyRun.value)
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]).toHaveLength(
      1
    )

    dependencies.resolveOrderCanonical.mockClear()
    const orderControl = await server.cells.listOrderControl.execute({
      locationId,
      view: "all",
      limit: 25,
    })
    expect(orderControl.kind).toBe("success")
    if (orderControl.kind === "success") {
      expect(
        listProcessorOrderControlResultSchema.parse(orderControl.value)
      ).toEqual(orderControl.value)
      expect(orderControl.value.items[0]?.canonical).toMatchObject({
        source: { name: "cents" },
      })
      expect(orderControl.value.items[0]?.canonical?.audit).toHaveLength(8)
    }
    expect(dependencies.resolveOrderCanonical.mock.calls[0]?.[0]?.[0]).toEqual({
      referenceId: ids.order,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: "ORDER-FALLBACK",
    })
    expect(dependencies.loadOrderAudit).toHaveBeenCalledWith({
      canonicalOrderIds: [ids.canonicalOrder],
      productionOrderIds: [ids.order],
    })
  })

  it("preserves body/query/params validation precedence and validated path scope", () => {
    const cases = [
      {
        validate: requireHttpSurface(
          previewProcessorProductionOrderBacklogCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {}, body: { invalid: true } }),
        code: "invalid_body_type",
      },
      {
        validate: requireHttpSurface(
          loadProcessorProductionWorkspaceCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {}, query: { limit: 0, invalid: true } }),
        code: "invalid_query_type",
      },
      {
        validate: requireHttpSurface(
          loadProcessorRemainingDayForecastCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {}, query: { limit: 0, invalid: true } }),
        code: "invalid_query_type",
      },
      {
        validate: requireHttpSurface(
          listProcessorProductionHistoryActivityCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {}, query: { limit: 0, invalid: true } }),
        code: "invalid_query_type",
      },
      {
        validate: requireHttpSurface(
          listProcessorProductionOrderControlCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {}, query: { limit: 0, invalid: true } }),
        code: "invalid_query_type",
      },
      {
        validate: requireHttpSurface(
          loadProcessorProductionBoardCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {} }),
        code: "invalid_params_type",
      },
      {
        validate: requireHttpSurface(
          loadProcessorProductionHistoryRunCellDeclaration.surfaces[0]
        ).validateRequest,
        request: request({ params: {} }),
        code: "invalid_params_type",
      },
    ]
    for (const fixture of cases) {
      expect(fixture.validate).not.toBeNull()
      try {
        fixture.validate?.(fixture.request)
        expect.unreachable("invalid request should fail")
      } catch (error) {
        expect(isAppError(error)).toBe(true)
        if (isAppError(error)) expect(error.code).toBe(fixture.code)
      }
    }
    const boardSurface = requireHttpSurface(
      loadProcessorProductionBoardCellDeclaration.surfaces[0]
    )
    expect(
      boardSurface.decodeAuthorizationScope?.({
        params: { locationId, productionRunId: ids.run },
        query: {},
        headers: {},
      })
    ).toEqual({ kind: "valid", value: locationId })
  })

  it("retains plain typed failure presentation and unexpected AppError propagation", async () => {
    const surface = requireHttpSurface(
      loadProcessorProductionBoardCellDeclaration.surfaces[0]
    )
    const failedCell = makeLoadProcessorProductionBoardCell({
      loadBoard: async () => ({ kind: "failure", failure: typedFailure }),
      resolveOrderCanonical: vi.fn(),
    })
    await expect(
      failedCell.execute({ locationId, productionRunId: ids.run })
    ).resolves.toEqual({ kind: "failure", failure: typedFailure })
    try {
      surface.present({ kind: "failure", failure: typedFailure })
      expect.unreachable("plain failure should be thrown")
    } catch (error) {
      expect(error).toBe(typedFailure)
      expect(normalizeUnknownError(error)).toMatchObject({
        status: 500,
        code: "unknown_thrown_value",
      })
    }

    const fault = databaseError({
      code: "processor_board_query_failed",
      message: "Board query failed.",
      safeMessage: "Board query failed.",
      status: 503,
    })
    const cell = makeLoadProcessorProductionBoardCell({
      loadBoard: async () => {
        throw fault
      },
      resolveOrderCanonical: vi.fn(),
    })
    await expect(
      cell.execute({ locationId, productionRunId: ids.run })
    ).rejects.toBe(fault)
  })

  it("validates successful HTTP presentation against the Processor schema", () => {
    const dependencies = makeDependencies()
    const cell = makeProcessorServerExperience(dependencies).cells.loadBoard
    return cell
      .execute({ locationId, productionRunId: ids.run })
      .then((outcome) => {
        const surface = requireHttpSurface(cell.surfaces[0])
        expect(surface.present(outcome)).toEqual({
          status: 200,
          body: {
            ok: true,
            data:
              outcome.kind === "success"
                ? processorProductionBoardSchema.parse(outcome.value)
                : undefined,
          },
        })
      })
  })
})
