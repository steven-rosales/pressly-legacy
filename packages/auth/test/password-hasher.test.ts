import { describe, expect, it } from 'vitest';

import {
  makePasswordHasher,
  makePasswordVerifier,
} from '../src/credentials/index.ts';

describe('make password hasher', () => {
  it('hashes a password that the verifier can verify', async () => {
    const hasher = makePasswordHasher();
    const verifier = makePasswordVerifier();

    const hash = await hasher.hash('CorrectHorse1!Battery');

    const verified = await verifier.verify(hash, 'CorrectHorse1!Battery');

    expect(hash).not.toBe('CorrectHorse1!Battery');
    expect(verified).toBe(true);
  });

  it('returns an app error when hashing fails', async () => {
    const hasher = makePasswordHasher({
      hashPassword: async () => {
        throw new Error('argon failed');
      },
    });

    await expect(hasher.hash('CorrectHorse1!Battery')).rejects.toMatchObject({
      code: 'password_hashing_failed',
    });
  });
});
