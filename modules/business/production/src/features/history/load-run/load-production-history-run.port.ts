import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  ProductionHistoryRunDetail,
  ProductionHistoryRunReadResult,
} from '../../../foundations/language/history/production-history.model.ts';
import type { LoadProductionHistoryRunCommand } from './load-production-history-run.model.ts';

export type LoadProductionHistoryRun = (
  command: LoadProductionHistoryRunCommand,
) => Promise<Result<ProductionHistoryRunDetail, ProductionFeatureFailure>>;

export type LoadProductionHistoryRunRepository = Readonly<{
  load: (
    command: LoadProductionHistoryRunCommand,
    now: Date,
  ) => Promise<ProductionHistoryRunReadResult>;
}>;
