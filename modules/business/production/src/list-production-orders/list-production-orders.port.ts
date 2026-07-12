import type {
  ListProductionOrdersQuery,
  ListProductionOrdersResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type ListProductionOrdersCommand = ListProductionOrdersQuery &
  Readonly<{ locationId: string }>;

export type ListProductionOrders = (
  command: ListProductionOrdersCommand,
) => Promise<Result<ListProductionOrdersResult, AppError>>;

export type ListProductionOrdersRepositoryResult =
  | Readonly<{ tag: 'found'; value: ListProductionOrdersResult }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'invalid_cursor' }>;

export type ListProductionOrdersRepository = Readonly<{
  listOrders: (
    command: ListProductionOrdersCommand,
    now: Date,
  ) => Promise<ListProductionOrdersRepositoryResult>;
}>;
