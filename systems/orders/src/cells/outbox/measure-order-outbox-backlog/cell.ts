import { defineOperation } from '@pressly/cells';
import type { OrderOutboxBacklog } from '../../../model/order-outbox/model.ts';
import { measureOrderOutboxBacklogContract } from './contract.ts';
import {
  makeExecuteMeasureOrderOutboxBacklog,
  type MeasureOrderOutboxBacklogDependencies,
} from './execute.ts';
import {
  measureOrderOutboxBacklogOperationId,
  type MeasureOrderOutboxBacklogExpectedFailure,
  type MeasureOrderOutboxBacklogInput,
} from './types.ts';

export const measureOrderOutboxBacklogCellDeclaration = defineOperation<
  MeasureOrderOutboxBacklogInput,
  OrderOutboxBacklog,
  MeasureOrderOutboxBacklogExpectedFailure
>({
  kind: 'query',
  id: measureOrderOutboxBacklogOperationId,
  authentication: 'none',
  contract: measureOrderOutboxBacklogContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'orders.measure_order_outbox_backlog' },
});

export const makeMeasureOrderOutboxBacklogCell = (
  dependencies: MeasureOrderOutboxBacklogDependencies,
) =>
  defineOperation(
    measureOrderOutboxBacklogCellDeclaration,
    makeExecuteMeasureOrderOutboxBacklog(dependencies),
  );
