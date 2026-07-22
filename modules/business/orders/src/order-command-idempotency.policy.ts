import { createHash } from 'node:crypto';
import { canonicalJson } from '@pressly/kernel';

export const hashOrderCommand = (command: unknown): string =>
  createHash('sha256').update(canonicalJson(command)).digest('hex');
