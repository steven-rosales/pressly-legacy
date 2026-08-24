import { describe, expect, it } from 'vitest';
import {
  businessScope,
  isAssignmentActive,
  type RoleAssignment,
} from './public.ts';

const now = new Date('2026-07-29T16:00:00.000Z');

const assignment = (changes: Partial<RoleAssignment> = {}): RoleAssignment => ({
  role: 'manager',
  scope: businessScope('business-1'),
  state: 'active',
  version: 1,
  ...changes,
});

describe('isAssignmentActive', () => {
  it('requires an active lifecycle state and a current time window', () => {
    expect(isAssignmentActive(assignment(), now)).toBe(true);
    expect(
      isAssignmentActive(assignment({ state: 'revoked', version: 2 }), now),
    ).toBe(false);
    expect(
      isAssignmentActive(assignment({ state: 'expired', version: 2 }), now),
    ).toBe(false);
    expect(
      isAssignmentActive(
        assignment({ startsAt: new Date('2026-07-30T16:00:00.000Z') }),
        now,
      ),
    ).toBe(false);
    expect(
      isAssignmentActive(
        assignment({ endsAt: new Date('2026-07-29T16:00:00.000Z') }),
        now,
      ),
    ).toBe(false);
  });
});
