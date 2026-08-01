import { describe, expect, it } from 'vitest';
import { evaluateBatchMembershipTransition } from '../../src/batch-membership/batch-membership.policy.ts';

describe('batch membership policy', () => {
  it('lets operators freeze queued work and managers unfreeze it', () => {
    expect(
      evaluateBatchMembershipTransition({
        action: 'freeze',
        batchStatus: 'queued',
        membershipFrozen: false,
        authorizedAction: 'production:queue',
      }),
    ).toEqual({ tag: 'ok', value: { membershipFrozen: true } });
    expect(
      evaluateBatchMembershipTransition({
        action: 'unfreeze',
        batchStatus: 'queued',
        membershipFrozen: true,
        authorizedAction: 'production:override',
      }),
    ).toEqual({ tag: 'ok', value: { membershipFrozen: false } });
  });

  it('keeps unfreeze manager-only and non-queued membership permanent', () => {
    expect(
      evaluateBatchMembershipTransition({
        action: 'unfreeze',
        batchStatus: 'queued',
        membershipFrozen: true,
        authorizedAction: 'production:queue',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_UNFREEZE_FORBIDDEN' },
    });
    expect(
      evaluateBatchMembershipTransition({
        action: 'unfreeze',
        batchStatus: 'sorting',
        membershipFrozen: true,
        authorizedAction: 'production:override',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_MEMBERSHIP_IMMUTABLE' },
    });
  });
});
