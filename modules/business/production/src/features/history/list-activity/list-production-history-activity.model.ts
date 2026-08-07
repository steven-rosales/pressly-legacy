import type {
  ProductionHistoryActivityEntry,
  ProductionHistoryEntityType,
  ProductionHistoryEventType,
  ProductionHistoryPage,
} from '../../../foundations/language/history/production-history.model.ts';

export type ListProductionHistoryActivityCommand = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  runId?: string;
  entityType?: ProductionHistoryEntityType;
  eventType?: ProductionHistoryEventType;
  orderResolution?: 'archived' | 'restored';
  search?: string;
  occurredAfter?: Date;
}>;

export type ProductionHistoryActivityPage =
  ProductionHistoryPage<ProductionHistoryActivityEntry>;
