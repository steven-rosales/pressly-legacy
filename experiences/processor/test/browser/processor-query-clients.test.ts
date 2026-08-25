import { listProcessorOrderControlResultSchema } from "../../src/contracts/production-order-control.ts"
import {
  processorListProductionHistoryActivityResultSchema,
  processorProductionHistoryRunDetailSchema,
} from "../../src/contracts/production-history.ts"
import { processorProductionBoardSchema } from "../../src/contracts/production-board.ts"
import { processorProductionOrderBacklogPreviewSchema } from "../../src/contracts/production-order-backlog.ts"
import { processorProductionWorkspaceSchema } from "../../src/contracts/production-workspace.ts"
import { processorRemainingDayForecastSchema } from "../../src/contracts/remaining-day-forecast.ts"
import { productionOrderBacklogCursorSchema } from "@pressly/production-system/contracts/read-models/production-order-backlog"
import { invariantViolationError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeListProductionHistoryActivityClient,
  type ListProductionHistoryActivityRequestTransport,
} from "../../src/features/history/list-activity/client.ts"
import {
  makeListProductionOrderControlClient,
  type ListProductionOrderControlRequestTransport,
} from "../../src/features/orders/list-order-control/client.ts"
import {
  makeLoadProductionBoardClient,
  type LoadProductionBoardRequestTransport,
} from "../../src/features/queries/load-board/client.ts"
import {
  makeLoadProductionHistoryRunClient,
  type LoadProductionHistoryRunRequestTransport,
} from "../../src/features/history/load-run/client.ts"
import {
  makeLoadProductionWorkspaceClient,
  type LoadProductionWorkspaceRequestTransport,
} from "../../src/features/queries/load-workspace/client.ts"
import {
  makeLoadRemainingDayForecastClient,
  type LoadRemainingDayForecastRequestTransport,
} from "../../src/features/queries/load-remaining-day-forecast/client.ts"
import {
  makePreviewProductionOrderBacklogClient,
  type PreviewProductionOrderBacklogRequestTransport,
} from "../../src/features/queries/preview-order-backlog/client.ts"
import type { ListProductionHistoryActivityClientOperation } from "../../src/features/history/list-activity/types.ts"
import type { ListProductionOrderControlClientOperation } from "../../src/features/orders/list-order-control/types.ts"
import type { LoadProductionBoardClientOperation } from "../../src/features/queries/load-board/types.ts"
import type { LoadProductionHistoryRunClientOperation } from "../../src/features/history/load-run/types.ts"
import type { LoadProductionWorkspaceClientOperation } from "../../src/features/queries/load-workspace/types.ts"
import type { LoadRemainingDayForecastClientOperation } from "../../src/features/queries/load-remaining-day-forecast/types.ts"
import type { PreviewProductionOrderBacklogClientOperation } from "../../src/features/queries/preview-order-backlog/types.ts"

const contract = Object.freeze({
  inputVersion: 1,
  outputVersion: 1,
  failureVersion: 1,
})

const operations = Object.freeze({
  board: {
    operationId: "processor.load-production-board.v1",
    contract,
    http: {
      board: {
        method: "GET",
        path: "/production/locations/:locationId/runs/:productionRunId/board",
      },
    },
  } satisfies LoadProductionBoardClientOperation,
  workspace: {
    operationId: "processor.load-production-workspace.v1",
    contract,
    http: {
      workspace: {
        method: "GET",
        path: "/production/locations/:locationId/workspace",
      },
    },
  } satisfies LoadProductionWorkspaceClientOperation,
  forecast: {
    operationId: "processor.load-remaining-day-forecast.v1",
    contract,
    http: {
      forecast: {
        method: "GET",
        path: "/production/locations/:locationId/forecast",
      },
    },
  } satisfies LoadRemainingDayForecastClientOperation,
  backlog: {
    operationId: "processor.preview-production-order-backlog.v1",
    contract,
    http: {
      preview: {
        method: "POST",
        path: "/production/locations/:locationId/order-backlog/preview",
      },
    },
  } satisfies PreviewProductionOrderBacklogClientOperation,
  activity: {
    operationId: "processor.list-production-history-activity.v1",
    contract,
    http: {
      activity: {
        method: "GET",
        path: "/production/locations/:locationId/history/activity",
      },
    },
  } satisfies ListProductionHistoryActivityClientOperation,
  run: {
    operationId: "processor.load-production-history-run.v1",
    contract,
    http: {
      request: {
        method: "GET",
        path: "/production/locations/:locationId/history/runs/:productionRunId",
      },
    },
  } satisfies LoadProductionHistoryRunClientOperation,
  control: {
    operationId: "processor.list-production-order-control.v1",
    contract,
    http: {
      "order-control": {
        method: "GET",
        path: "/production/locations/:locationId/order-control",
      },
    },
  } satisfies ListProductionOrderControlClientOperation,
})

const rejected = <
  Transport extends (...args: never[]) => Promise<unknown>,
>() => {
  const fault = invariantViolationError({
    code: "processor_query_browser_request_fault_fixture",
    message: "Browser request fault fixture.",
  })
  return { fault, request: vi.fn<Transport>().mockRejectedValue(fault) }
}

describe("Processor query browser clients", () => {
  it("renders the board identity and forwards cancellation", async () => {
    const { fault, request } = rejected<LoadProductionBoardRequestTransport>()
    const client = makeLoadProductionBoardClient({
      operation: operations.board,
      request,
    })
    const controller = new AbortController()

    await expect(
      client("location/one", "run one/two", controller.signal)
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/runs/run%20one%2Ftwo/board",
        signal: controller.signal,
      },
      processorProductionBoardSchema
    )
  })

  it("omits an absent workspace shift and encodes an explicit shift", async () => {
    const { fault, request } =
      rejected<LoadProductionWorkspaceRequestTransport>()
    const client = makeLoadProductionWorkspaceClient({
      operation: operations.workspace,
      request,
    })
    const controller = new AbortController()

    await expect(client("location one")).rejects.toBe(fault)
    await expect(
      client("location one", "shift/one", controller.signal)
    ).rejects.toBe(fault)
    expect(request).toHaveBeenNthCalledWith(
      1,
      {
        method: "GET",
        path: "/production/locations/location%20one/workspace",
      },
      processorProductionWorkspaceSchema
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      {
        method: "GET",
        path: "/production/locations/location%20one/workspace?shiftId=shift%2Fone",
        signal: controller.signal,
      },
      processorProductionWorkspaceSchema
    )
  })

  it("encodes the service day and forwards forecast cancellation", async () => {
    const { fault, request } =
      rejected<LoadRemainingDayForecastRequestTransport>()
    const client = makeLoadRemainingDayForecastClient({
      operation: operations.forecast,
      request,
    })
    const controller = new AbortController()

    await expect(
      client({
        locationId: "location/one",
        serviceDay: "2026-11-01",
        signal: controller.signal,
      })
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/forecast?serviceDay=2026-11-01",
        signal: controller.signal,
      },
      processorRemainingDayForecastSchema
    )
  })

  it("preserves the exact backlog body defaults and cursor bytes", async () => {
    const { fault, request } =
      rejected<PreviewProductionOrderBacklogRequestTransport>()
    const client = makePreviewProductionOrderBacklogClient({
      operation: operations.backlog,
      request,
    })
    const body = {
      filter: "all_due_before_cutoff" as const,
      cutoff: "2026-08-01T00:00:00.000Z",
      reason: "processor_not_in_use" as const,
      cursor: productionOrderBacklogCursorSchema.parse(
        "eyJ2IjoxLCJieXRlcyI6Il8tIn0"
      ),
      maxOrders: 250,
    }

    await expect(
      client({ locationId: "location/one", request: body })
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%2Fone/order-backlog/preview",
        body,
      },
      processorProductionOrderBacklogPreviewSchema
    )
  })

  it("retains activity query omission, insertion order, encoding, and signal", async () => {
    const { fault, request } =
      rejected<ListProductionHistoryActivityRequestTransport>()
    const client = makeListProductionHistoryActivityClient({
      operation: operations.activity,
      request,
    })
    const controller = new AbortController()

    await expect(
      client({
        locationId: "location/one",
        query: {
          limit: 50,
          cursor: "cursor_-bytes",
          search: "run one & two",
          runId: "71000000-0000-4000-8000-000000000001",
          eventType: undefined,
          orderResolution: "archived",
        },
        signal: controller.signal,
      })
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/history/activity?limit=50&cursor=cursor_-bytes&search=run+one+%26+two&runId=71000000-0000-4000-8000-000000000001&orderResolution=archived",
        signal: controller.signal,
      },
      processorListProductionHistoryActivityResultSchema
    )
  })

  it("renders the exact history-run identity and forwards cancellation", async () => {
    const { fault, request } =
      rejected<LoadProductionHistoryRunRequestTransport>()
    const client = makeLoadProductionHistoryRunClient({
      operation: operations.run,
      request,
    })
    const controller = new AbortController()

    await expect(
      client("location/one", "run one/two", controller.signal)
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/history/runs/run%20one%2Ftwo",
        signal: controller.signal,
      },
      processorProductionHistoryRunDetailSchema
    )
  })

  it("retains order-control query insertion order, boolean encoding, and omission", async () => {
    const { fault, request } =
      rejected<ListProductionOrderControlRequestTransport>()
    const client = makeListProductionOrderControlClient({
      operation: operations.control,
      request,
    })
    const controller = new AbortController()

    await expect(
      client({
        locationId: "location/one",
        query: {
          view: "active",
          limit: 25,
          priority: true,
          movable: false,
          search: undefined,
          cursor: "cursor_-bytes",
        },
        signal: controller.signal,
      })
    ).rejects.toBe(fault)
    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/order-control?view=active&limit=25&priority=true&movable=false&cursor=cursor_-bytes",
        signal: controller.signal,
      },
      listProcessorOrderControlResultSchema
    )
  })
})
