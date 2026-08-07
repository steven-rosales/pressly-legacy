import type { OperationalOrderIdentityQueries } from '@pressly/processor-experience';
import type {
  ProductionHistoryActivityPage,
  ProductionHistoryRunDetail,
  ProductionOrderBacklogPreview,
  ProductionBoard,
  ProductionRemainingDayForecast,
  ProductionWorkspaceModel,
} from '@pressly/production';
import {
  toProcessorProductionHistoryActivityContract,
  toProcessorProductionHistoryRunContract,
} from './production-history.contract.mapper.ts';
import { toProcessorProductionBoardContract } from './production-board.contract.mapper.ts';
import { toProcessorProductionOrderBacklogContract } from './production-order-backlog.contract.mapper.ts';
import { toProcessorProductionWorkspaceContract } from './production-workspace.contract.mapper.ts';
import { toProcessorRemainingDayForecastContract } from './remaining-day-forecast.contract.mapper.ts';

export const makeProcessorOperationalOrderIdentityAdapter = (
  identities: OperationalOrderIdentityQueries,
) =>
  Object.freeze({
    composeBoard: async (base: ProductionBoard) =>
      toProcessorProductionBoardContract(base, await identities.forBoard(base)),
    composeWorkspace: async (base: ProductionWorkspaceModel) =>
      toProcessorProductionWorkspaceContract(
        base,
        await identities.forWorkspace(base),
      ),
    composeForecast: async (base: ProductionRemainingDayForecast) =>
      toProcessorRemainingDayForecastContract(
        base,
        await identities.forForecast(base),
      ),
    composeHistoryRun: async (base: ProductionHistoryRunDetail) =>
      toProcessorProductionHistoryRunContract(
        base,
        await identities.forHistoryRun(base),
      ),
    composeBacklogPreview: async (base: ProductionOrderBacklogPreview) =>
      toProcessorProductionOrderBacklogContract(
        base,
        await identities.forBacklog(base),
      ),
    composeHistoryActivity: async (base: ProductionHistoryActivityPage) =>
      toProcessorProductionHistoryActivityContract(
        base,
        await identities.forHistoryActivity(base),
      ),
  });

export type ProcessorOperationalOrderIdentityAdapter = ReturnType<
  typeof makeProcessorOperationalOrderIdentityAdapter
>;
