import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.ts';

export const sha256Text = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const sha256Bytes = (value: Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export const canonicalSha256 = (value: unknown): string =>
  sha256Text(canonicalJson(value));
