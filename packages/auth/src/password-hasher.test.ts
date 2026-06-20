import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';

import { makePasswordVerifier } from './password-verifier.ts';
import { makePasswordHasher } from './password-hasher.ts';

describe('make password hasher', () => {
  it('hashes a password that the verifier can verify', async () => {
    const hasher = makePasswordHasher();
    const verifier = makePasswordVerifier();

    const hash = await hasher.hash('CorrectHorse1!Battery');

    expect(result.isOk(hash)).toBe(true);
    if (result.isErr(hash)) throw hash.error;

    const verified = await verifier.verify(hash.value, 'CorrectHorse1!Battery');

    expect(result.isOk(verified)).toBe(true);
    if (result.isErr(verified)) throw verified.error;

    expect(hash.value).not.toBe('CorrectHorse1!Battery');
    expect(verified.value).toBe(true);
  });

  it('returns an app error when hashing fails', async () => {
    const hasher = makePasswordHasher({
      hashPassword: async () => {
        throw new Error('argon failed');
      },
    });

    const hashResult = await hasher.hash('CorrectHorse1!Battery');

    expect(result.isErr(hashResult)).toBe(true);
    if (result.isOk(hashResult)) throw new Error('Expect hashing to fail.');

    expect(hashResult.error.code).toBe('password_hashing_failed');
  });
});
