import { describe, expect, it } from 'vitest';
import {
  decideSourceRevision,
  maySourceWriteField,
} from '../../src/user-source-ordering.policy.ts';
import { decideUserSourceUpdate } from '../../src/observe-user-source/observe-user-source.policy.ts';

describe('user source ordering', () => {
  const at = new Date('2026-07-21T12:00:00.000Z');

  it('applies a first or newer observation', () => {
    expect(decideSourceRevision(null, { at, hash: 'a' }).tag).toBe('ok');
    expect(
      decideSourceRevision(
        { at, hash: 'a' },
        { at: new Date(at.getTime() + 1), hash: 'b' },
      ),
    ).toEqual({ tag: 'ok', value: 'apply' });
  });

  it('distinguishes replay, stale delivery, and divergent equal revisions', () => {
    expect(decideSourceRevision({ at, hash: 'a' }, { at, hash: 'a' })).toEqual({
      tag: 'ok',
      value: 'replay',
    });
    expect(
      decideSourceRevision(
        { at, hash: 'a' },
        { at: new Date(at.getTime() - 1), hash: 'z' },
      ),
    ).toEqual({ tag: 'ok', value: 'stale' });
    expect(decideSourceRevision({ at, hash: 'a' }, { at, hash: 'b' })).toEqual({
      tag: 'err',
      error: 'conflict',
    });
  });

  it('does not overwrite a Pressly-owned field from a source', () => {
    expect(maySourceWriteField(null, 'cents')).toBe(true);
    expect(
      maySourceWriteField({ authority: 'source', source: 'cents' }, 'cents'),
    ).toBe(true);
    expect(
      maySourceWriteField({ authority: 'pressly', source: null }, 'cents'),
    ).toBe(false);
  });

  it('produces only source-authorized profile changes', () => {
    const decision = decideUserSourceUpdate({
      current: {
        sourceLinkId: 'source-link-1',
        user: {
          id: 'user-1',
          version: 2,
          active: true,
          firstName: 'Pressly',
          lastName: null,
          businessName: null,
          phone: null,
          email: null,
        },
        revision: { at, hash: 'a' },
        authorities: new Map([
          ['firstName', { authority: 'pressly', source: null }],
          ['phone', { authority: 'source', source: 'cents' }],
        ]),
      },
      observation: {
        context: {
          origin: 'cents',
          principal: { kind: 'system', id: 'cents-webhook' },
        },
        source: 'cents',
        externalUserId: 'customer-1',
        profile: {
          firstName: 'Vendor',
          lastName: null,
          businessName: null,
          phone: '+12025550123',
          email: null,
        },
        revision: {
          at: new Date(at.getTime() + 1),
          hash: 'b',
          adapterVersion: 'cents-v1',
          observedAt: at,
          normalizedPayload: {},
        },
      },
    });

    expect(decision).toMatchObject({
      tag: 'ok',
      value: {
        kind: 'apply',
        changes: { phone: '+12025550123' },
        nextVersion: 3,
      },
    });
    if (decision.tag === 'ok' && decision.value.kind === 'apply')
      expect(decision.value.changes).not.toHaveProperty('firstName');
  });
});
