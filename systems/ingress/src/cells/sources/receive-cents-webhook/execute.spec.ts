import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { CENTS_WEBHOOK_MAX_BODY_BYTES } from '../../../sources/cents/public.ts';
import { makeExecuteReceiveCentsWebhook } from './execute.ts';
import { receiveCentsWebhookCellDeclaration } from './cell.ts';
import type { ReceiveCentsWebhookFailure } from './types.ts';

const command = (payload: unknown) => ({
  rawBodyBase64: Buffer.from(JSON.stringify(payload)).toString('base64'),
});

const validOrder = {
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    orderCode: '00123',
    status: 'SUBMITTED',
    orderTotal: 29.99,
    balanceDue: 24.99,
    dueDate: '2026-07-12T21:00:00.000Z',
    updatedAt: '2026-07-12T15:59:00.000Z',
  },
  services: [
    {
      id: 43,
      name: 'Wash and Fold',
      quantity: 10,
      totalPrice: 29.99,
      unitCost: 2,
      serviceCategory: 'Wash and Fold',
      serviceCategoryType: 'LAUNDRY',
    },
  ],
  customer: {
    id: 815,
    firstName: 'Fixture',
    lastName: 'Customer',
    email: 'fixture@example.invalid',
    phoneNumber: '+15550000001',
  },
};

const expectNormalizationFailure = async (
  input: Readonly<{ rawBodyBase64: string }>,
  code: ReceiveCentsWebhookFailure['code'],
): Promise<void> => {
  const ingestEvent = vi.fn();
  const result = await makeExecuteReceiveCentsWebhook({ ingestEvent })(input);

  expect(result).toMatchObject({
    kind: 'failure',
    failure: { kind: 'validation', code },
  });
  expect(ingestEvent).not.toHaveBeenCalled();
};

const expectLinkFailure = async (
  failure: Readonly<{
    kind: 'conflict' | 'not_found';
    code:
      | 'webhook_quarantine_link_conflict'
      | 'webhook_quarantine_receipt_not_found';
  }>,
): Promise<void> => {
  const captureReceipt = vi.fn(async () => ({
    kind: 'success' as const,
    value: { receiptId: 'receipt-1', duplicate: false },
  }));
  const ingestEvent = vi.fn(async () => ({
    kind: 'success' as const,
    value: {
      eventId: '00000000-0000-4000-8000-000000000001',
      duplicate: false,
      status: 'pending' as const,
    },
  }));
  const linkReceipt = vi.fn(async () => ({
    kind: 'failure' as const,
    failure: {
      ...failure,
      message: 'The receipt link was rejected.',
      safeMessage: 'The receipt link was rejected.',
    },
  }));
  const result = await makeExecuteReceiveCentsWebhook({
    captureReceipt,
    ingestEvent,
    linkReceipt,
    payloadCipher: {
      encrypt: () => 'ciphertext',
      decrypt: () => new Uint8Array(),
    },
  })(command(validOrder));

  expect(result).toMatchObject({ kind: 'failure', failure });
  expect(captureReceipt).toHaveBeenCalledOnce();
  expect(ingestEvent).toHaveBeenCalledOnce();
  expect(linkReceipt).toHaveBeenCalledWith({
    receiptId: 'receipt-1',
    eventId: '00000000-0000-4000-8000-000000000001',
  });
};

describe('receive Cents webhook cell', () => {
  it('owns the raw Cents HTTP operation as one authenticated cell', () => {
    expect(receiveCentsWebhookCellDeclaration).toMatchObject({
      id: 'ingress.receive-cents-webhook.v1',
      authentication: 'required',
      surfaces: [
        expect.objectContaining({
          kind: 'http',
          method: 'POST',
          path: '/webhooks/cents',
        }),
      ],
    });
  });

  proveOperation({
    operationId: 'ingress.receive-cents-webhook.v1',
    declaration: receiveCentsWebhookCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'rejects cents_webhook_body_too_large before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({
              action: 'unsupported',
              padding: 'x'.repeat(CENTS_WEBHOOK_MAX_BODY_BYTES),
            }),
            'cents_webhook_body_too_large',
          ),
      },
      {
        name: 'rejects invalid_cents_webhook_envelope before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({}),
            'invalid_cents_webhook_envelope',
          ),
      },
      {
        name: 'rejects conflicting_cents_event_kind before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({ action: 'order_updated', event: 'order_created' }),
            'conflicting_cents_event_kind',
          ),
      },
      {
        name: 'rejects invalid_cents_order_payload before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({
              ...validOrder,
              order: { ...validOrder.order, dueDate: 'not-a-date' },
            }),
            'invalid_cents_order_payload',
          ),
      },
      {
        name: 'rejects invalid_cents_customer_payload before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({ ...validOrder, customer: { id: -1 } }),
            'invalid_cents_customer_payload',
          ),
      },
      {
        name: 'rejects invalid_cents_money before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({
              ...validOrder,
              services: [{ ...validOrder.services[0], totalPrice: '29.999' }],
            }),
            'invalid_cents_money',
          ),
      },
      {
        name: 'rejects conflicting_cents_unit_price before ingestion',
        proves: ['executor-success'],
        run: () =>
          expectNormalizationFailure(
            command({
              ...validOrder,
              services: [
                {
                  ...validOrder.services[0],
                  unitPrice: 3,
                  unitCost: 2,
                },
              ],
            }),
            'conflicting_cents_unit_price',
          ),
      },
      {
        name: 'returns webhook_quarantine_receipt_not_found after durable ingestion',
        proves: ['executor-success'],
        run: () =>
          expectLinkFailure({
            kind: 'not_found',
            code: 'webhook_quarantine_receipt_not_found',
          }),
      },
      {
        name: 'returns webhook_quarantine_link_conflict after durable ingestion',
        proves: ['executor-success'],
        run: () =>
          expectLinkFailure({
            kind: 'conflict',
            code: 'webhook_quarantine_link_conflict',
          }),
      },
      {
        name: 'normalizes and ingests one valid order',
        proves: ['executor-success'],
        run: async () => {
          const ingestEvent = vi.fn(async () => ({
            kind: 'success' as const,
            value: {
              eventId: '00000000-0000-4000-8000-000000000001',
              duplicate: false,
              status: 'pending' as const,
            },
          }));
          const result = await makeExecuteReceiveCentsWebhook({ ingestEvent })(
            command(validOrder),
          );

          expect(result.kind).toBe('success');
          expect(ingestEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              source: 'cents',
              disposition: 'process',
            }),
          );
        },
      },
    ],
  });

  it('returns malformed JSON as typed validation data without ingestion', async () => {
    const ingestEvent = vi.fn();
    const result = await makeExecuteReceiveCentsWebhook({ ingestEvent })({
      rawBodyBase64: Buffer.from('{"broken"').toString('base64'),
    });

    expect(result).toMatchObject({
      kind: 'failure',
      failure: { kind: 'validation', code: 'invalid_cents_webhook_body' },
    });
    expect(ingestEvent).not.toHaveBeenCalled();
  });
});
