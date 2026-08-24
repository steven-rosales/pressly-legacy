import { createHash, randomBytes } from 'node:crypto';

export type RecoveryCodeService = Readonly<{
  generate: (count: number) => readonly string[];
  hash: (code: string) => string;
}>;

const normalizeRecoveryCode = (code: string): string =>
  code.replaceAll('-', '').trim().toUpperCase();

export const makeRecoveryCodeService = (): RecoveryCodeService => ({
  generate: (count) =>
    Array.from({ length: count }, () => {
      const hexadecimal = randomBytes(12).toString('hex').toUpperCase();
      return Array.from({ length: 6 }, (_, index) =>
        hexadecimal.slice(index * 4, index * 4 + 4),
      ).join('-');
    }),
  hash: (code) =>
    createHash('sha256')
      .update(normalizeRecoveryCode(code), 'utf8')
      .digest('hex'),
});
