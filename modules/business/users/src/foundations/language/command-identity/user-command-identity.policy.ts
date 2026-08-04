import { canonicalSha256 } from '@pressly/codec/node';

export const hashUserCommand = (command: object): string =>
  canonicalSha256(command);
