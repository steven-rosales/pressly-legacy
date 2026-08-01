import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { makeAppError } from '@pressly/errors';

const sha256Bytes = 32;
const minimumKeyBytes = 32;

export const centsWebhookClockWindowSeconds = 5 * 60;

export type CentsWebhookVerificationInput = Readonly<{
  rawBody: Buffer;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}>;

export type CentsWebhookVerificationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      kind: 'invalid_authentication' | 'verification_unavailable';
    }>;

export type CentsWebhookVerifier = (
  input: CentsWebhookVerificationInput,
) => CentsWebhookVerificationResult | Promise<CentsWebhookVerificationResult>;

export type CentsWebhookHmacVerifierOptions = Readonly<{
  currentKey?: string;
  previousKey?: string;
  clock: Readonly<{ now: () => Date }>;
  clockWindowSeconds?: number;
}>;

const verified = (): CentsWebhookVerificationResult => ({ ok: true });

const rejected = (): CentsWebhookVerificationResult => ({
  ok: false,
  kind: 'invalid_authentication',
});

const verificationUnavailable = (): CentsWebhookVerificationResult => ({
  ok: false,
  kind: 'verification_unavailable',
});

const readSingleHeader = (
  headers: CentsWebhookVerificationInput['headers'],
  name: string,
): string | undefined => {
  const expectedName = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === expectedName,
  );
  const value = entry?.[1];

  return typeof value === 'string' ? value : undefined;
};

const parseUnixSeconds = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;

  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
};

const parseSignature = (value: string | undefined): Buffer | undefined => {
  if (value === undefined) return undefined;

  const match = /^v1=([a-f\d]{64})$/i.exec(value);
  if (match === null) return undefined;

  const signature = Buffer.from(match[1]!, 'hex');
  return signature.length === sha256Bytes ? signature : undefined;
};

const isUsableKey = (key: string | undefined): key is string =>
  key !== undefined && Buffer.byteLength(key, 'utf8') >= minimumKeyBytes;

const validClockWindow = (seconds: number): boolean =>
  Number.isSafeInteger(seconds) && seconds > 0;

const sign = (key: string, timestamp: string, rawBody: Buffer): Buffer =>
  createHmac('sha256', key)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest();

export const makeCentsWebhookHmacVerifier = (
  options: CentsWebhookHmacVerifierOptions,
): CentsWebhookVerifier => {
  const clockWindowSeconds =
    options.clockWindowSeconds ?? centsWebhookClockWindowSeconds;

  return ({ rawBody, headers }) => {
    if (
      !isUsableKey(options.currentKey) ||
      (options.previousKey !== undefined &&
        !isUsableKey(options.previousKey)) ||
      !validClockWindow(clockWindowSeconds)
    )
      return verificationUnavailable();

    const timestampHeader = readSingleHeader(headers, 'X-Cents-Timestamp');
    const timestamp = parseUnixSeconds(timestampHeader);
    const signature = parseSignature(
      readSingleHeader(headers, 'X-Cents-Signature'),
    );
    const now = options.clock.now();
    const nowSeconds = Math.floor(now.getTime() / 1_000);

    if (
      timestampHeader === undefined ||
      timestamp === undefined ||
      signature === undefined ||
      !Number.isSafeInteger(nowSeconds) ||
      Math.abs(nowSeconds - timestamp) > clockWindowSeconds
    )
      return rejected();

    const keys = [options.currentKey, options.previousKey].filter(isUsableKey);
    let matched = 0;

    for (const key of keys) {
      const expected = sign(key, timestampHeader, rawBody);
      matched |= timingSafeEqual(expected, signature) ? 1 : 0;
    }

    return matched === 1 ? verified() : rejected();
  };
};

const unavailable = () =>
  makeAppError({
    kind: 'ExternalServiceError',
    code: 'cents_webhook_verification_unavailable',
    message: 'Cents webhook verification is not configured or could not run.',
    safeMessage: 'Vendor webhook receipt is not configured.',
    status: 503,
  });

const invalidAuthentication = () =>
  makeAppError({
    kind: 'AuthError',
    code: 'invalid_cents_webhook_authentication',
    message: 'Cents webhook authentication failed.',
    safeMessage: 'Vendor webhook authentication failed.',
    status: 401,
  });

export const rejectUnverifiedCentsWebhook: CentsWebhookVerifier = () =>
  verificationUnavailable();

/**
 * Explicit compatibility policy for Cents' documented unsigned webhook.
 * Select this only through runtime configuration; HMAC remains the default.
 */
export const acceptUnsignedCentsWebhook: CentsWebhookVerifier = () =>
  verified();

export const makeCentsWebhookBoundary =
  (verify: CentsWebhookVerifier): RequestHandler =>
  async (request, response, next) => {
    if (!Buffer.isBuffer(request.body)) {
      next(unavailable());
      return;
    }

    let verification: CentsWebhookVerificationResult;
    try {
      verification = await verify({
        rawBody: request.body,
        headers: request.headers,
      });
    } catch {
      next(unavailable());
      return;
    }

    if (!verification.ok) {
      next(
        verification.kind === 'verification_unavailable'
          ? unavailable()
          : invalidAuthentication(),
      );
      return;
    }

    try {
      const rawBody = request.body;
      request.body = JSON.parse(rawBody.toString('utf8')) as unknown;
      response.locals['centsWebhookRawBody'] = rawBody;
      next();
    } catch {
      next(
        makeAppError({
          kind: 'ValidationError',
          code: 'invalid_cents_webhook_body',
          message: 'Cents webhook body was not valid JSON.',
          safeMessage: 'The vendor webhook body is invalid.',
          status: 400,
        }),
      );
    }
  };

export const readCentsWebhookRawBody = (
  locals: Record<string, unknown>,
): Buffer | null => {
  const rawBody = locals['centsWebhookRawBody'];
  return Buffer.isBuffer(rawBody) ? rawBody : null;
};
