import type { ListProductionHistoryActivityResult } from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import { copyProductionHistoryActivityDetails } from '../../../foundations/adapters/postgres/history/production-history-activity.persistence.mapper.ts';
import type { ProductionHistoryActivityPage } from './list-production-history-activity.model.ts';

export const toListProductionHistoryActivityResult = (
  page: ProductionHistoryActivityPage,
): ListProductionHistoryActivityResult => ({
  items: page.items.map((entry) => ({
    ...entry,
    details: copyProductionHistoryActivityDetails(entry.details),
    occurredAt: utcIsoFromDate(entry.occurredAt),
  })),
  nextCursor: page.nextCursor,
  asOf: utcIsoFromDate(page.asOf),
});
