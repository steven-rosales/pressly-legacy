import type { ListProductionOrderControlFailure } from './list-production-order-control.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  ListProductionOrderControlCommand,
  ListProductionOrderControlResult,
} from './list-production-order-control.model.ts';

export type ListProductionOrderControl = (
  command: ListProductionOrderControlCommand,
) => Promise<
  Result<ListProductionOrderControlResult, ListProductionOrderControlFailure>
>;

export type ListProductionOrderControlRepositoryResult =
  | Readonly<{ tag: 'found'; value: ListProductionOrderControlResult }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'invalid_cursor' }>;

export type ListProductionOrderControlRepository = Readonly<{
  list: (
    command: ListProductionOrderControlCommand,
    now: Date,
  ) => Promise<ListProductionOrderControlRepositoryResult>;
}>;
