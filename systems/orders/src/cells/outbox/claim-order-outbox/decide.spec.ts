import { describe, expect, it } from 'vitest';
import { validateClaimOrderOutbox } from './decide.ts';

const valid = () => ({ workerId: 'worker-1', limit: 25, leaseMs: 30_000 });

describe('validate claim Order outbox', () => {
  it('accepts the deployed claim envelope', () => {
    expect(validateClaimOrderOutbox(valid())).toBeNull();
  });

  it.each([
    ['blank worker identity', { ...valid(), workerId: '  ' }],
    ['zero limit', { ...valid(), limit: 0 }],
    ['limit above 100', { ...valid(), limit: 101 }],
    ['fractional limit', { ...valid(), limit: 1.5 }],
    ['lease below one second', { ...valid(), leaseMs: 999 }],
  ])('rejects %s', (_, command) => {
    expect(validateClaimOrderOutbox(command)).toEqual({
      kind: 'validation',
      code: 'order_outbox_claim_invalid',
      message: 'The outbox claim request is invalid.',
    });
  });

  it('retains the legacy direct-call treatment of NaN lease duration', () => {
    expect(
      validateClaimOrderOutbox({ ...valid(), leaseMs: Number.NaN }),
    ).toBeNull();
  });
});
