import { createHash } from 'node:crypto';

export const automaticPlacementIdempotencyKey = (sourceKey: string): string =>
  `auto:${createHash('sha256').update(sourceKey).digest('hex')}`;
