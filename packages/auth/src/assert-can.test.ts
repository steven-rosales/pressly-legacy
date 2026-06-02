import { isAppError } from '@pressly/errors';
import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.ts';
import { assertCan, can } from './assert-can.ts';

const actor: Actor = {
  id: 'actor_1',
  kind: 'human',
  displayName: 'Steven',
  role: 'admin',
  permissions: ['auth:session:read'],
};

describe('can', () => {
  it('checks whether an actor has a permission', () => {
    expect(can(actor, 'auth:session:read')).toBe(true);
    expect(can(actor, 'pricing:publish')).toBe(false);
  });
});

describe('assertCan', () => {
  it('returns when permission is present', () => {
    expect(() => assertCan(actor, 'auth:session:read')).not.toThrow();
  });

  it('throws a permission AppError when permission is missing', () => {
    try {
      assertCan(actor, 'pricing:publish');
      throw new Error('expected assertCan to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (!isAppError(error)) throw error;

      expect(error.kind).toBe('PermissionError');
      expect(error.code).toBe('missing_permission');
      expect(error.status).toBe(403);
      expect(error.message).toBe(
        'Actor actor_1 is missing permission pricing:publish',
      );
      expect(error.safeMessage).toBe(
        'You do not have permission to perform this action',
      );
    }
  });
});
