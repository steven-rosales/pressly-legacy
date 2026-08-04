import { canonicalSha256 } from '@pressly/codec/node';

export const hashOrderCommand = (command: unknown): string =>
  canonicalSha256(command);
