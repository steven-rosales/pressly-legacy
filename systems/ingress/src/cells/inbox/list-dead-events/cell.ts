import { bindCell, declareQueryCell } from '@pressly/cells';
import type {
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
} from '../../../model/inbox.ts';
import { listDeadEventsContract } from './contract.ts';
import { listDeadEventsHttpSurface } from './http.ts';
import {
  makeExecuteListDeadEvents,
  type ListDeadEventsDependencies,
} from './execute.ts';
import {
  listDeadEventsOperationId,
  type ListDeadEventsExpectedFailure,
} from './types.ts';

export const listDeadEventsCellDeclaration = declareQueryCell<
  ListDeadWebhookEventsQuery,
  DeadWebhookEventsResult,
  ListDeadEventsExpectedFailure
>({
  id: listDeadEventsOperationId,
  authentication: 'required',
  contract: listDeadEventsContract,
  authorization: {
    capability: 'production:resources',
    timing: 'before-input',
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [listDeadEventsHttpSurface],
  observability: { operation: 'ingress.list_dead_events' },
});

export const makeListDeadEventsCell = (deps: ListDeadEventsDependencies) =>
  bindCell(listDeadEventsCellDeclaration, makeExecuteListDeadEvents(deps));
