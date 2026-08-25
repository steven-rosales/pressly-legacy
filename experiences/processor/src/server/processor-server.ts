import { loadProcessorProductionHistoryRunCellDeclaration } from "../cells/history/load-production-history-run/cell.ts"
import {
  makeLoadProcessorProductionHistoryRunCell,
  type LoadProductionHistoryRun,
} from "../cells/history/load-production-history-run/execute.ts"
import { listProcessorProductionHistoryActivityCellDeclaration } from "../cells/history/list-production-history-activity/cell.ts"
import {
  makeListProcessorProductionHistoryActivityCell,
  type ListProductionHistoryActivity,
} from "../cells/history/list-production-history-activity/execute.ts"
import { listProcessorProductionOrderControlCellDeclaration } from "../cells/orders/list-production-order-control/cell.ts"
import {
  makeListProcessorProductionOrderControlCell,
  type ListProductionOrderControl,
} from "../cells/orders/list-production-order-control/execute.ts"
import { loadProcessorProductionBoardCellDeclaration } from "../cells/production/load-production-board/cell.ts"
import {
  makeLoadProcessorProductionBoardCell,
  type LoadProductionBoard,
} from "../cells/production/load-production-board/execute.ts"
import { loadProcessorRemainingDayForecastCellDeclaration } from "../cells/forecast/load-remaining-day-forecast/cell.ts"
import {
  makeLoadProcessorRemainingDayForecastCell,
  type LoadRemainingDayForecast,
} from "../cells/forecast/load-remaining-day-forecast/execute.ts"
import { loadProcessorProductionWorkspaceCellDeclaration } from "../cells/production/load-production-workspace/cell.ts"
import {
  makeLoadProcessorProductionWorkspaceCell,
  type LoadProductionWorkspace,
} from "../cells/production/load-production-workspace/execute.ts"
import { previewProcessorProductionOrderBacklogCellDeclaration } from "../cells/production/preview-production-order-backlog/cell.ts"
import {
  makePreviewProcessorProductionOrderBacklogCell,
  type PreviewProductionOrderBacklog,
} from "../cells/production/preview-production-order-backlog/execute.ts"
import type { LoadOperationalOrderAudit } from "./model/operational-order-audit.ts"
import type { ResolveOperationalOrderCanonical } from "./model/operational-order.ts"

export type ProcessorServerProductionQueries = Readonly<{
  loadBoard: LoadProductionBoard
  previewOrderBacklog: PreviewProductionOrderBacklog
  loadWorkspace: LoadProductionWorkspace
  loadRemainingDayForecast: LoadRemainingDayForecast
  listHistoryActivity: ListProductionHistoryActivity
  loadHistoryRun: LoadProductionHistoryRun
  listOrderControl: ListProductionOrderControl
}>

export type ProcessorServerDependencies = Readonly<{
  production: ProcessorServerProductionQueries
  resolveOrderCanonical: ResolveOperationalOrderCanonical
  loadOrderAudit: LoadOperationalOrderAudit
}>

export const processorServerCellDeclarations = Object.freeze({
  loadBoard: loadProcessorProductionBoardCellDeclaration,
  previewOrderBacklog: previewProcessorProductionOrderBacklogCellDeclaration,
  loadWorkspace: loadProcessorProductionWorkspaceCellDeclaration,
  loadRemainingDayForecast: loadProcessorRemainingDayForecastCellDeclaration,
  listHistoryActivity: listProcessorProductionHistoryActivityCellDeclaration,
  loadHistoryRun: loadProcessorProductionHistoryRunCellDeclaration,
  listOrderControl: listProcessorProductionOrderControlCellDeclaration,
})

export const makeProcessorServerExperience = (
  dependencies: ProcessorServerDependencies
) =>
  Object.freeze({
    cells: Object.freeze({
      loadBoard: makeLoadProcessorProductionBoardCell({
        loadBoard: dependencies.production.loadBoard,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      previewOrderBacklog: makePreviewProcessorProductionOrderBacklogCell({
        previewBacklog: dependencies.production.previewOrderBacklog,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      loadWorkspace: makeLoadProcessorProductionWorkspaceCell({
        loadWorkspace: dependencies.production.loadWorkspace,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      loadRemainingDayForecast: makeLoadProcessorRemainingDayForecastCell({
        loadForecast: dependencies.production.loadRemainingDayForecast,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      listHistoryActivity: makeListProcessorProductionHistoryActivityCell({
        listActivity: dependencies.production.listHistoryActivity,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      loadHistoryRun: makeLoadProcessorProductionHistoryRunCell({
        loadRun: dependencies.production.loadHistoryRun,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
      }),
      listOrderControl: makeListProcessorProductionOrderControlCell({
        listOrderControl: dependencies.production.listOrderControl,
        resolveOrderCanonical: dependencies.resolveOrderCanonical,
        loadOrderAudit: dependencies.loadOrderAudit,
      }),
    }),
  })
