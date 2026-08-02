import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.ts';

export const canonicalSha256 = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
