import { createHash, randomBytes } from 'node:crypto';

export type RecoveryCodeService = Readonly<{
  generate: (count: number) => readonly string[];
  hash: (code: string) => string;
}>;

const normalize = (code: string): string =>
  code.replaceAll('-', '').trim().toUpperCase();

export const makeRecoveryCodeService = (): RecoveryCodeService => ({
  generate: (count) =>
    Array.from({ length: count }, () =>
      randomBytes(12)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,4}/g)!
        .join('-'),
    ),
  hash: (code) =>
    createHash('sha256').update(normalize(code), 'utf8').digest('hex'),
});
