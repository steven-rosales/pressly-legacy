import type {
  ProductionHistoryPage,
  ProductionHistoryPlanStatus,
  ProductionHistoryPlanSummary,
} from '../../../foundations/language/history/production-history.model.ts';

export type ListProductionHistoryPlansCommand = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  runId?: string;
  search?: string;
  status?: ProductionHistoryPlanStatus;
  createdAfter?: Date;
}>;

export type ProductionHistoryPlansPage =
  ProductionHistoryPage<ProductionHistoryPlanSummary>;
