import { createHmac, timingSafeEqual } from 'node:crypto';

export type HmacSha256Part = string | Uint8Array;

export const utf8ByteLength = (value: string): number =>
  Buffer.byteLength(value, 'utf8');

export const hmacSha256 = (
  key: string,
  parts: readonly HmacSha256Part[],
): Uint8Array => {
  const hmac = createHmac('sha256', key);
  for (const part of parts)
    if (typeof part === 'string') hmac.update(part, 'utf8');
    else hmac.update(part);
  return new Uint8Array(hmac.digest());
};

export const constantTimeBytesEqual = (
  left: Uint8Array,
  right: Uint8Array,
): boolean =>
  left.byteLength === right.byteLength && timingSafeEqual(left, right);
