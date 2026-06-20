import { describe, expect, it } from 'vitest';

import type { Actor } from '../src/actor.ts';
import { allowDecision, denyDecision } from '../src/decision.ts';

const actor: Actor = {
  id: 'actor_1',
  kind: 'human',
  displayName: 'Steven',
  role: 'admin',
  permissions: ['auth:session:read'],
};

describe('allowDecision', () => {
  it('returns an allowed auth decision with the actor', () => {
    expect(allowDecision(actor)).toEqual({ ok: true, actor });
  });
});

describe('denyDecision', () => {
  it('omits details when not provided', () => {
    expect(
      denyDecision(
        'missing_permission',
        'You do not have permission to perform this action.',
      ),
    ).toEqual({
      ok: false,
      reason: 'missing_permission',
      safeMessage: 'You do not have permission to perform this action.',
    });
  });

  it('includes details when provided', () => {
    expect(
      denyDecision('missing_context', 'Choose a location.', {
        condition: 'location_context',
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_context',
      safeMessage: 'Choose a location.',
      details: { condition: 'location_context' },
    });
  });
});
