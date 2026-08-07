import { randomUUID } from 'node:crypto';
import type { IdSource } from './id-source.ts';

export const uuidIdSource: IdSource = Object.freeze({
  next: randomUUID,
});
