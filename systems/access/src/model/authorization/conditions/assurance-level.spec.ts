import { describe, expect, it } from 'vitest';
import type { PolicyInput } from '../policy.ts';
import { hasAssuranceLevel } from './assurance-level.ts';
import { globalScope } from '../scope.ts';

const input = (assuranceLevel?: 'password' | 'mfa'): PolicyInput => ({
  principal: {
    identityId: '11111111-1111-4111-8111-111111111111',
    kind: 'human',
    displayName: 'Owner',
  },
  principalAttributes: {
    identityActive: true,
    assignments: [],
    ...(assuranceLevel === undefined ? {} : { assuranceLevel }),
  },
  action: 'pricing:publish',
  resource: { kind: 'pricing.catalog', scope: globalScope() },
  environment: { now: new Date('2026-06-29T12:00:00.000Z') },
});

describe('hasAssuranceLevel', () => {
  it('allows only configured authentication assurance', () => {
    const condition = hasAssuranceLevel(['mfa']);

    expect(condition.evaluate(input('mfa'))).toBe(true);
    expect(condition.evaluate(input('password'))).toBe(false);
    expect(condition.evaluate(input())).toBe(false);
    expect(condition.denyReason).toBe('insufficient_assurance');
  });
});
