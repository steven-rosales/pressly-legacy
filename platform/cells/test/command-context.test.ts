import { describe, expect, it } from 'vitest';
import { isCommandContextValid } from '../src/command-context.ts';

describe('command context', () => {
  it('requires a trusted origin and principal identity', () => {
    expect(
      isCommandContextValid({
        origin: 'pressly_dashboard',
        principal: { kind: 'human', id: 'identity-1' },
      }),
    ).toBe(true);
    expect(
      isCommandContextValid({
        origin: ' ',
        principal: { kind: 'system', id: 'cents-webhook' },
      }),
    ).toBe(false);
    expect(
      isCommandContextValid({
        origin: 'cents',
        principal: { kind: 'system', id: ' ' },
      }),
    ).toBe(false);
  });
});
