import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  ListProductionOrdersCommand,
  ProductionOrderPage,
} from './list-production-orders.model.ts';

export type ListProductionOrders = (
  command: ListProductionOrdersCommand,
) => Promise<Result<ProductionOrderPage, ProductionFeatureFailure>>;

export type ListProductionOrdersRepositoryResult =
  | Readonly<{ tag: 'found'; value: ProductionOrderPage }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'invalid_cursor' }>;

export type ListProductionOrdersRepository = Readonly<{
  listOrders: (
    command: ListProductionOrdersCommand,
    now: Date,
  ) => Promise<ListProductionOrdersRepositoryResult>;
}>;
