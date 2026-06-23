import { describe, expect, it } from 'vitest';

import {
  allowDecision,
  denyDecision,
  isAllowed,
  isDenied,
} from '../../src/authorization/index.ts';

describe('authorization decisions', () => {
  it('creates and narrows allowed decisions', () => {
    const decision = allowDecision('pricing.publish');

    expect(decision).toEqual({
      tag: 'allowed',
      policyId: 'pricing.publish',
    });
    expect(isAllowed(decision)).toBe(true);
    expect(isDenied(decision)).toBe(false);
  });

  it('omits optional denied fields when not provided', () => {
    expect(
      denyDecision({
        reason: 'missing_assignment',
        safeMessage: 'You do not have permission.',
      }),
    ).toEqual({
      tag: 'denied',
      reason: 'missing_assignment',
      safeMessage: 'You do not have permission.',
    });
  });

  it('includes denied policy id and details when provided', () => {
    const decision = denyDecision({
      reason: 'missing_context',
      safeMessage: 'Choose a location.',
      policyId: 'pricing.publish',
      details: { condition: 'location_context' },
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'missing_context',
      safeMessage: 'Choose a location.',
      policyId: 'pricing.publish',
      details: { condition: 'location_context' },
    });
    expect(isAllowed(decision)).toBe(false);
    expect(isDenied(decision)).toBe(true);
  });
});
