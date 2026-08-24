import { describe, expect, it, vi } from 'vitest';
import { makeAppError } from '@pressly/errors/app-error';
import { makeExecuteReceiveCentsWebhook } from '@pressly/ingress-system/operations/sources/receive-cents-webhook/execute';
import { documentedCentsOrderWebhook } from './cents-webhook.fixtures.ts';

const rawCommand = (payload: unknown) => ({
  rawBodyBase64: Buffer.from(JSON.stringify(payload)).toString('base64'),
});

const dependencies = () => {
  const captureReceipt = vi.fn(async () => ({
    kind: 'success' as const,
    value: {
      receiptId: '00000000-0000-4000-8000-000000000001',
      duplicate: false,
    },
  }));
  const ingestEvent = vi.fn(async () => ({
    kind: 'success' as const,
    value: {
      eventId: '00000000-0000-4000-8000-000000000002',
      duplicate: false,
      status: 'pending' as const,
    },
  }));
  const linkReceipt = vi.fn(async () => ({
    kind: 'success' as const,
    value: { linked: true },
  }));
  return {
    captureReceipt,
    ingestEvent,
    linkReceipt,
    payloadCipher: {
      encrypt: () => 'v1.iv.ciphertext.tag',
      decrypt: () => Buffer.alloc(0),
    },
  };
};

describe('Ingress receive-Cents-webhook executor', () => {
  it('captures, normalizes, ingests, and links one encrypted receipt', async () => {
    const deps = dependencies();
    const result = await makeExecuteReceiveCentsWebhook(deps)(
      rawCommand(documentedCentsOrderWebhook),
    );

    expect(result).toEqual({
      kind: 'success',
      value: {
        eventId: '00000000-0000-4000-8000-000000000002',
        duplicate: false,
        status: 'pending',
      },
    });
    expect(deps.captureReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cents',
        rawBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        adapterVersion: 'cents-webhook-v1',
        eventType: 'order_updated',
        payloadCiphertext: 'v1.iv.ciphertext.tag',
        normalization: { outcome: 'accepted' },
      }),
    );
    expect(deps.ingestEvent).toHaveBeenCalledOnce();
    expect(deps.linkReceipt).toHaveBeenCalledWith({
      receiptId: '00000000-0000-4000-8000-000000000001',
      eventId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('durably captures a rejected normalization without canonical ingestion', async () => {
    const deps = dependencies();
    const result = await makeExecuteReceiveCentsWebhook(deps)(
      rawCommand({
        action: 'order_updated',
        order: { status: 'SUBMITTED' },
        customer: { email: 'private@example.invalid' },
      }),
    );

    expect(result).toMatchObject({
      kind: 'failure',
      failure: { code: 'invalid_cents_order_payload' },
    });
    expect(deps.captureReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: null,
        normalization: {
          outcome: 'rejected',
          errorCode: 'invalid_cents_order_payload',
        },
      }),
    );
    expect(deps.ingestEvent).not.toHaveBeenCalled();
    expect(deps.linkReceipt).not.toHaveBeenCalled();
  });

  it('fails closed when quarantine persistence is unavailable', async () => {
    const deps = dependencies();
    const error = makeAppError({
      kind: 'DatabaseError',
      code: 'webhook_quarantine_capture_failed',
      message: 'failed',
      safeMessage: 'failed',
      status: 503,
    });
    deps.captureReceipt.mockImplementation(async () => {
      throw error;
    });

    await expect(
      makeExecuteReceiveCentsWebhook(deps)(
        rawCommand(documentedCentsOrderWebhook),
      ),
    ).rejects.toBe(error);
  });
});
