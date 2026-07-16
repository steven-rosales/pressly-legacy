import type {
  ListProductionOrderControlQuery,
  ListProductionOrderControlResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type ListProductionOrderControlCommand =
  ListProductionOrderControlQuery & Readonly<{ locationId: string }>;

export type ListProductionOrderControl = (
  command: ListProductionOrderControlCommand,
) => Promise<Result<ListProductionOrderControlResult, AppError>>;

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
