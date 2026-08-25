import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '@pressly/errors/app-error';
import { authError, externalServiceError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import {
  acceptUnsignedCentsWebhook,
  centsWebhookClockWindowSeconds,
  makeCentsWebhookHmacVerifier,
  rejectUnverifiedCentsWebhook,
  type CentsWebhookVerifier,
} from '@pressly/ingress-system/sources/cents';
import { makeRawBodyAuthentication } from '@pressly/http-host/runtime';

const now = new Date('2026-07-12T16:00:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1_000);
const currentKey = 'current-cents-hmac-key-with-32-bytes-minimum';
const previousKey = 'previous-cents-hmac-key-with-32-bytes-minimum';

const signature = (key: string, timestamp: string, body: Buffer): string =>
  `v1=${createHmac('sha256', key)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body)
    .digest('hex')}`;

const signedHeaders = (
  key: string,
  body: Buffer,
  timestamp = String(nowSeconds),
) => ({
  'x-cents-timestamp': timestamp,
  'x-cents-signature': signature(key, timestamp, body),
});

const verifier = (
  input: {
    currentKey?: string;
    previousKey?: string;
    clock?: Clock;
    clockWindowSeconds?: number;
  } = {},
) =>
  makeCentsWebhookHmacVerifier({
    currentKey: input.currentKey ?? currentKey,
    ...(input.previousKey === undefined
      ? {}
      : { previousKey: input.previousKey }),
    now: (input.clock ?? { now: () => now }).now,
    ...(input.clockWindowSeconds === undefined
      ? {}
      : { clockWindowSeconds: input.clockWindowSeconds }),
  });

const verify = async (
  candidate: CentsWebhookVerifier,
  body: Buffer,
  headers: Record<string, string | readonly string[] | undefined>,
) => candidate({ rawBody: body, headers });

const runBoundary = async (input: {
  verify: CentsWebhookVerifier;
  body: unknown;
  headers?: Record<string, string | readonly string[] | undefined>;
}) => {
  const request = {
    body: input.body,
    headers: input.headers ?? {},
  } as unknown as Request;
  const response = { locals: {} } as Response;
  const next = vi.fn();

  await Promise.resolve(
    makeRawBodyAuthentication({
      verify: input.verify,
      unavailable: (cause) =>
        externalServiceError({
          code: 'cents_webhook_verification_unavailable',
          message: 'Cents webhook verification unavailable.',
          safeMessage: 'Vendor webhook receipt is not configured.',
          status: 503,
          ...(cause === undefined ? {} : { cause }),
        }),
      rejected: (kind) =>
        kind === 'verification_unavailable'
          ? externalServiceError({
              code: 'cents_webhook_verification_unavailable',
              message: 'Cents webhook verification unavailable.',
              safeMessage: 'Vendor webhook receipt is not configured.',
              status: 503,
            })
          : authError({
              code: 'invalid_cents_webhook_authentication',
              message: 'Cents webhook authentication failed.',
              safeMessage: 'Vendor webhook authentication failed.',
            }),
      accepted: (locals) => {
        locals['authenticated'] = true;
      },
    })(request, response, next as unknown as NextFunction),
  );

  return { request, response, next };
};

const nextError = (next: ReturnType<typeof vi.fn>): AppError => {
  const error = next.mock.calls[0]?.[0];
  if (!(error instanceof Error)) throw new Error('Expected boundary error.');
  return error as AppError;
};

describe('Cents webhook HMAC verifier', () => {
  it('authenticates the timestamp, period, and exact raw body bytes', async () => {
    const body = Buffer.from('{ "order": 42, "note": "exact bytes" }');

    await expect(
      verify(verifier(), body, signedHeaders(currentKey, body)),
    ).resolves.toEqual({ ok: true });

    const reformatted = Buffer.from('{"order":42,"note":"exact bytes"}');
    await expect(
      verify(verifier(), reformatted, signedHeaders(currentKey, body)),
    ).resolves.toEqual({
      ok: false,
      kind: 'invalid_authentication',
    });
  });

  it.each([
    ['missing timestamp', { 'x-cents-timestamp': undefined }, undefined],
    [
      'duplicate timestamp',
      {
        'x-cents-timestamp': [String(nowSeconds), String(nowSeconds)],
      },
      undefined,
    ],
    ['non-integer timestamp', { 'x-cents-timestamp': '1.5' }, undefined],
    ['wrong version', {}, `v2=${'a'.repeat(64)}`],
    ['short signature', {}, `v1=${'a'.repeat(62)}`],
    ['non-hex signature', {}, `v1=${'z'.repeat(64)}`],
  ])(
    'rejects %s without weakening the auth result',
    async (_name, extra, value) => {
      const body = Buffer.from('{}');
      const headers = {
        ...signedHeaders(currentKey, body),
        ...extra,
        ...(value === undefined ? {} : { 'x-cents-signature': value }),
      };

      await expect(verify(verifier(), body, headers)).resolves.toEqual({
        ok: false,
        kind: 'invalid_authentication',
      });
    },
  );

  it('rejects wrong keys and body mutation with one indistinguishable result', async () => {
    const body = Buffer.from('{"order":42}');
    const wrongKey = 'wrong-cents-hmac-key-with-32-bytes-minimum';

    await expect(
      verify(verifier(), body, signedHeaders(wrongKey, body)),
    ).resolves.toEqual({ ok: false, kind: 'invalid_authentication' });
    await expect(
      verify(
        verifier(),
        Buffer.from('{"order":43}'),
        signedHeaders(currentKey, body),
      ),
    ).resolves.toEqual({ ok: false, kind: 'invalid_authentication' });
  });

  it('enforces the symmetric five-minute clock window', async () => {
    const body = Buffer.from('{}');
    const at = (offsetSeconds: number) => String(nowSeconds + offsetSeconds);

    for (const offset of [
      -centsWebhookClockWindowSeconds - 1,
      centsWebhookClockWindowSeconds + 1,
    ])
      await expect(
        verify(verifier(), body, signedHeaders(currentKey, body, at(offset))),
      ).resolves.toEqual({ ok: false, kind: 'invalid_authentication' });

    for (const offset of [
      -centsWebhookClockWindowSeconds,
      centsWebhookClockWindowSeconds,
    ])
      await expect(
        verify(verifier(), body, signedHeaders(currentKey, body, at(offset))),
      ).resolves.toEqual({ ok: true });
  });

  it('accepts current and previous keys during rotation without naming the match', async () => {
    const body = Buffer.from('{}');
    const rotating = verifier({ previousKey });

    await expect(
      verify(rotating, body, signedHeaders(currentKey, body)),
    ).resolves.toEqual({ ok: true });
    await expect(
      verify(rotating, body, signedHeaders(previousKey, body)),
    ).resolves.toEqual({ ok: true });
  });

  it('reports missing or unsafe key configuration as unavailable', async () => {
    const body = Buffer.from('{}');
    const headers = signedHeaders(currentKey, body);
    const missing = makeCentsWebhookHmacVerifier({
      now: () => now,
    });
    const shortPrevious = makeCentsWebhookHmacVerifier({
      currentKey,
      previousKey: 'short',
      now: () => now,
    });

    await expect(verify(missing, body, headers)).resolves.toEqual({
      ok: false,
      kind: 'verification_unavailable',
    });
    await expect(verify(shortPrevious, body, headers)).resolves.toEqual({
      ok: false,
      kind: 'verification_unavailable',
    });
  });
});

describe('Cents webhook raw-body boundary', () => {
  it('accepts the raw body in explicit unsigned compatibility mode', async () => {
    const body = Buffer.from('{"order":42}');
    const boundary = await runBoundary({
      verify: acceptUnsignedCentsWebhook,
      body,
    });

    expect(boundary.next).toHaveBeenCalledWith();
    expect(boundary.request.body).toEqual(body);
    expect(boundary.response.locals['authenticated']).toBe(true);
  });

  it('marks the raw body authenticated only after successful verification', async () => {
    const body = Buffer.from('{"order":42}');
    const boundary = await runBoundary({
      verify: verifier(),
      body,
      headers: signedHeaders(currentKey, body),
    });

    expect(boundary.next).toHaveBeenCalledWith();
    expect(boundary.request.body).toEqual(body);
    expect(boundary.response.locals['authenticated']).toBe(true);
  });

  it('distinguishes invalid authentication from unavailable verification', async () => {
    const validBody = Buffer.from('{}');
    const invalid = await runBoundary({
      verify: verifier(),
      body: validBody,
      headers: signedHeaders(previousKey, validBody),
    });
    const unavailable = await runBoundary({
      verify: rejectUnverifiedCentsWebhook,
      body: validBody,
    });
    expect(nextError(invalid.next)).toMatchObject({
      code: 'invalid_cents_webhook_authentication',
      status: 401,
    });
    expect(nextError(unavailable.next)).toMatchObject({
      code: 'cents_webhook_verification_unavailable',
      status: 503,
    });
  });

  it('does not attach secrets, signatures, raw bodies, or thrown verifier details to errors', async () => {
    const body = Buffer.from('{"customerEmail":"private@example.com"');
    const secretInThrownError = 'verifier leaked current-cents-hmac-key';
    const boundary = await runBoundary({
      verify: async () => {
        throw new Error(secretInThrownError);
      },
      body,
      headers: signedHeaders(currentKey, body),
    });
    const error = nextError(boundary.next);
    const exposed = [
      error.code,
      error.message,
      error.safeMessage,
      JSON.stringify(error.details),
      JSON.stringify(error.cause),
    ].join(' ');

    expect(exposed).not.toContain(currentKey);
    expect(exposed).not.toContain(secretInThrownError);
    expect(exposed).not.toContain('private@example.com');
    expect(exposed).not.toContain(
      signedHeaders(currentKey, body)['x-cents-signature'],
    );
  });
});
