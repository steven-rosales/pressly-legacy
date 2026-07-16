import type {
  ListProductionHistoryActivityQuery,
  ListProductionHistoryActivityResult,
  ListProductionHistoryPlansQuery,
  ListProductionHistoryPlansResult,
  ListProductionHistoryRunsQuery,
  ListProductionHistoryRunsResult,
  ProductionHistoryRunDetail,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type ListProductionHistoryRunsCommand = ListProductionHistoryRunsQuery &
  Readonly<{ locationId: string }>;

export type ListProductionHistoryActivityCommand =
  ListProductionHistoryActivityQuery & Readonly<{ locationId: string }>;

export type ListProductionHistoryPlansCommand =
  ListProductionHistoryPlansQuery & Readonly<{ locationId: string }>;

export type LoadProductionHistoryRunCommand = Readonly<{
  locationId: string;
  productionRunId: string;
}>;

export type ListProductionHistoryRuns = (
  command: ListProductionHistoryRunsCommand,
) => Promise<Result<ListProductionHistoryRunsResult, AppError>>;

export type ListProductionHistoryActivity = (
  command: ListProductionHistoryActivityCommand,
) => Promise<Result<ListProductionHistoryActivityResult, AppError>>;

export type ListProductionHistoryPlans = (
  command: ListProductionHistoryPlansCommand,
) => Promise<Result<ListProductionHistoryPlansResult, AppError>>;

export type LoadProductionHistoryRun = (
  command: LoadProductionHistoryRunCommand,
) => Promise<Result<ProductionHistoryRunDetail, AppError>>;

export type ProductionHistoryRepositoryPageResult<Value> =
  | Readonly<{ tag: 'found'; value: Value }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'invalid_cursor' }>;

export type ProductionHistoryRepository = Readonly<{
  listRuns: (
    command: ListProductionHistoryRunsCommand,
    now: Date,
  ) => Promise<
    ProductionHistoryRepositoryPageResult<ListProductionHistoryRunsResult>
  >;
  listActivity: (
    command: ListProductionHistoryActivityCommand,
    now: Date,
  ) => Promise<
    ProductionHistoryRepositoryPageResult<ListProductionHistoryActivityResult>
  >;
  listPlans: (
    command: ListProductionHistoryPlansCommand,
    now: Date,
  ) => Promise<
    ProductionHistoryRepositoryPageResult<ListProductionHistoryPlansResult>
  >;
  loadRun: (
    command: LoadProductionHistoryRunCommand,
    now: Date,
  ) => Promise<
    | Readonly<{ tag: 'found'; value: ProductionHistoryRunDetail }>
    | Readonly<{ tag: 'location_not_found' }>
    | Readonly<{ tag: 'run_not_found' }>
  >;
}>;

export type ProductionHistoryApplication = Readonly<{
  listRuns: ListProductionHistoryRuns;
  listActivity: ListProductionHistoryActivity;
  listPlans: ListProductionHistoryPlans;
  loadRun: LoadProductionHistoryRun;
}>;
