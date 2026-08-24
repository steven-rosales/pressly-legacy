import { receiveCentsWebhookOperationId } from './types.ts';

export type ReceiveCentsWebhookCounterSignal = Readonly<{
  name: 'worker.inbox_receipts';
  attributes: Readonly<{ source: 'cents' }>;
}>;

export const receiveCentsWebhookCounterSignals = (input: {
  operationId: string;
  status: number;
}): readonly ReceiveCentsWebhookCounterSignal[] =>
  input.operationId === receiveCentsWebhookOperationId &&
  input.status >= 200 &&
  input.status < 300
    ? Object.freeze([
        { name: 'worker.inbox_receipts', attributes: { source: 'cents' } },
      ])
    : Object.freeze([]);
