import { defineOperation } from '@pressly/cells';
import { receiveCentsWebhookContract } from './contract.ts';
import { makeExecuteReceiveCentsWebhook } from './execute.ts';
import { receiveCentsWebhookHttpSurface } from './http.ts';
import {
  receiveCentsWebhookOperationId,
  type ReceiveCentsWebhookCommand,
  type ReceiveCentsWebhookDependencies,
  type ReceiveCentsWebhookFailure,
} from './types.ts';
import type { IngestWebhookEventResult } from '../../../model/inbox.ts';

export const receiveCentsWebhookCellDeclaration = defineOperation<
  ReceiveCentsWebhookCommand,
  IngestWebhookEventResult,
  ReceiveCentsWebhookFailure
>({
  kind: 'command',
  id: receiveCentsWebhookOperationId,
  authentication: 'required',
  contract: receiveCentsWebhookContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [receiveCentsWebhookHttpSurface],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.receive_cents_webhook' },
});

export const makeReceiveCentsWebhookCell = (
  dependencies: ReceiveCentsWebhookDependencies,
) =>
  defineOperation(
    receiveCentsWebhookCellDeclaration,
    makeExecuteReceiveCentsWebhook(dependencies),
  );
