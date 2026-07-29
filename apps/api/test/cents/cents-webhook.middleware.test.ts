import type { NextFunction, Request, Response } from 'express';
import type { CaptureWebhookReceipt } from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import { makeAppError } from '@pressly/errors';
import {
  makeCentsWebhookNormalizationBoundary,
  readCentsWebhookQuarantineReceiptId,
} from '../../src/http/webhooks/cents/cents-webhook-normalization.middleware.ts';
import { documentedCentsOrderWebhook } from './cents-webhook.fixtures.ts';

const run = async (input: {
  payload: unknown;
  captureReceipt: CaptureWebhookReceipt;
}) => {
  const rawBody = Buffer.from(JSON.stringify(input.payload));
  const request = { body: input.payload } as Request;
  const response = {
    locals: { centsWebhookRawBody: rawBody },
  } as unknown as Response;
  const next = vi.fn();
  await makeCentsWebhookNormalizationBoundary({
    captureReceipt: input.captureReceipt,
    payloadCipher: {
      encrypt: () => 'v1.iv.ciphertext.tag',
      decrypt: () => rawBody,
    },
  })(request, response, next as NextFunction);
  return { request, response, next };
};

describe('Cents webhook normalization quarantine', () => {
  it('captures encrypted raw receipt metadata before canonical ingestion', async () => {
    const captureReceipt = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        receiptId: '00000000-0000-4000-8000-000000000001',
        duplicate: false,
      },
    }));
    const boundary = await run({
      payload: documentedCentsOrderWebhook,
      captureReceipt,
    });

    expect(captureReceipt).toHaveBeenCalledWith({
      source: 'cents',
      rawBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      adapterVersion: 'cents-webhook-v1',
      eventType: 'order_updated',
      payloadCiphertext: 'v1.iv.ciphertext.tag',
      normalization: { outcome: 'accepted' },
    });
    expect(readCentsWebhookQuarantineReceiptId(boundary.response.locals)).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(boundary.request.body).toMatchObject({
      source: 'cents',
      eventType: 'order_updated',
      disposition: 'process',
      payload: { status: 'SUBMITTED' },
    });
    expect(boundary.next).toHaveBeenCalledWith();
  });

  it('captures normalization failures without creating a canonical command', async () => {
    const payload = {
      action: 'order_updated',
      order: { status: 'SUBMITTED' },
      customer: { email: 'private@example.invalid' },
    };
    const captureReceipt = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        receiptId: '00000000-0000-4000-8000-000000000002',
        duplicate: false,
      },
    }));
    const boundary = await run({ payload, captureReceipt });

    expect(captureReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: null,
        normalization: {
          outcome: 'rejected',
          errorCode: 'invalid_cents_order_payload',
        },
      }),
    );
    expect(boundary.request.body).toBe(payload);
    expect(boundary.next.mock.calls[0]?.[0]).toMatchObject({
      code: 'invalid_cents_order_payload',
      status: 400,
    });
  });

  it('fails closed when encrypted quarantine persistence is unavailable', async () => {
    const error = makeAppError({
      kind: 'DatabaseError',
      code: 'webhook_quarantine_capture_failed',
      message: 'failed',
      safeMessage: 'failed',
      status: 503,
    });
    const boundary = await run({
      payload: documentedCentsOrderWebhook,
      captureReceipt: vi.fn(async () => ({ tag: 'err' as const, error })),
    });

    expect(boundary.next).toHaveBeenCalledWith(error);
    expect(boundary.request.body).toBe(documentedCentsOrderWebhook);
  });
});
