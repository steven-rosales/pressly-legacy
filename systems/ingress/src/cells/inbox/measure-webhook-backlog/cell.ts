import { bindCell, declareQueryCell } from '@pressly/cells';
import type { WebhookBacklog } from '../../../model/inbox.ts';
import { measureWebhookBacklogContract } from './contract.ts';
import {
  makeExecuteMeasureWebhookBacklog,
  type MeasureWebhookBacklogDependencies,
} from './execute.ts';
import {
  measureWebhookBacklogOperationId,
  type MeasureWebhookBacklogExpectedFailure,
  type MeasureWebhookBacklogInput,
} from './types.ts';

export const measureWebhookBacklogCellDeclaration = declareQueryCell<
  MeasureWebhookBacklogInput,
  WebhookBacklog,
  MeasureWebhookBacklogExpectedFailure
>({
  id: measureWebhookBacklogOperationId,
  authentication: 'none',
  contract: measureWebhookBacklogContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'ingress.measure_webhook_backlog' },
});

export const makeMeasureWebhookBacklogCell = (
  deps: MeasureWebhookBacklogDependencies,
) =>
  bindCell(
    measureWebhookBacklogCellDeclaration,
    makeExecuteMeasureWebhookBacklog(deps),
  );
