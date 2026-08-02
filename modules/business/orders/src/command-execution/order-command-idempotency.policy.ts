import { canonicalSha256 } from '@pressly/kernel/node';

export const hashOrderCommand = (command: unknown): string =>
  canonicalSha256(command);
