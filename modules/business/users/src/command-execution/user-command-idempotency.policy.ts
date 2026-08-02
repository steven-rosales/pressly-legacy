import { canonicalSha256 } from '@pressly/kernel/node';

export const hashUserCommand = (command: unknown): string =>
  canonicalSha256(command);
