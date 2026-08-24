import {
  constantTimeBytesEqual,
  hmacSha256,
  utf8ByteLength,
} from '@pressly/auth-platform/hmac-sha256';

const sha256Bytes = 32;
const minimumKeyBytes = 32;

export const centsWebhookClockWindowSeconds = 5 * 60;

export type CentsWebhookVerificationInput = Readonly<{
  rawBody: Uint8Array;
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
  now: () => Date;
  clockWindowSeconds?: number;
}>;

const readSingleHeader = (
  headers: CentsWebhookVerificationInput['headers'],
  name: string,
): string | undefined => {
  const expectedName = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === expectedName,
  );
  return typeof entry?.[1] === 'string' ? entry[1] : undefined;
};

const usableKey = (key: string | undefined): key is string =>
  key !== undefined && utf8ByteLength(key) >= minimumKeyBytes;

const signatureBytes = (value: string | undefined): Uint8Array | null => {
  const match = value === undefined ? null : /^v1=([a-f\d]{64})$/i.exec(value);
  const hex = match?.[1];
  if (hex === undefined) return null;
  const signature = Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
  return signature.length === sha256Bytes ? signature : null;
};

export const makeCentsWebhookHmacVerifier = (
  options: CentsWebhookHmacVerifierOptions,
): CentsWebhookVerifier => {
  const windowSeconds =
    options.clockWindowSeconds ?? centsWebhookClockWindowSeconds;

  return ({ rawBody, headers }) => {
    if (
      !usableKey(options.currentKey) ||
      (options.previousKey !== undefined && !usableKey(options.previousKey)) ||
      !Number.isSafeInteger(windowSeconds) ||
      windowSeconds <= 0
    )
      return { ok: false, kind: 'verification_unavailable' };

    const timestampText = readSingleHeader(headers, 'X-Cents-Timestamp');
    const timestamp =
      timestampText !== undefined && /^(?:0|[1-9]\d*)$/.test(timestampText)
        ? Number(timestampText)
        : Number.NaN;
    const signature = signatureBytes(
      readSingleHeader(headers, 'X-Cents-Signature'),
    );
    const nowSeconds = Math.floor(options.now().getTime() / 1_000);
    if (
      timestampText === undefined ||
      !Number.isSafeInteger(timestamp) ||
      signature === null ||
      !Number.isSafeInteger(nowSeconds) ||
      Math.abs(nowSeconds - timestamp) > windowSeconds
    )
      return { ok: false, kind: 'invalid_authentication' };

    let matched = 0;
    for (const key of [options.currentKey, options.previousKey].filter(
      usableKey,
    )) {
      const expected = hmacSha256(key, [timestampText, '.', rawBody]);
      matched |= constantTimeBytesEqual(expected, signature) ? 1 : 0;
    }
    return matched === 1
      ? { ok: true }
      : { ok: false, kind: 'invalid_authentication' };
  };
};

export const rejectUnverifiedCentsWebhook: CentsWebhookVerifier = () => ({
  ok: false,
  kind: 'verification_unavailable',
});

export const acceptUnsignedCentsWebhook: CentsWebhookVerifier = () => ({
  ok: true,
});
