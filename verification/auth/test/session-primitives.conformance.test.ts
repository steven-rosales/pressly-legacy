import { readCookieValue } from '@pressly/auth-platform/cookies';
import { defineSessionCsrfProof } from '@pressly/auth-platform/csrf';
import { describe, expect, it } from 'vitest';

const domain = 'pressly.test.csrf.v1\0';

describe('session-bound CSRF proof conformance', () => {
  it('pins exact HMAC bytes and domain separation', () => {
    const target = defineSessionCsrfProof(domain);
    const sessionToken = 'opaque-session-token';
    const serverSecret = 'server-only-test-secret-at-least-32-bytes';
    const proof = target.derive(sessionToken, serverSecret);

    expect(proof).toBe('wugoS3smKCsrUHzYlPL6Fz39mSx_S66bPO9hWcIVZf4');
    expect(
      defineSessionCsrfProof('pressly.other.csrf.v1\0').derive(
        sessionToken,
        serverSecret,
      ),
    ).not.toBe(proof);
  });

  it('accepts only the exact proof without length-dependent exceptions', () => {
    const target = defineSessionCsrfProof(domain);
    const sessionToken = 'opaque-session-token';
    const serverSecret = 'server-only-test-secret-at-least-32-bytes';
    const proof = target.derive(sessionToken, serverSecret);

    expect(target.verify(proof, sessionToken, serverSecret)).toBe(true);
    expect(target.verify(undefined, sessionToken, serverSecret)).toBe(false);
    expect(target.verify('', sessionToken, serverSecret)).toBe(false);
    expect(target.verify(`${proof}x`, sessionToken, serverSecret)).toBe(false);
    expect(target.verify(proof.slice(1), sessionToken, serverSecret)).toBe(
      false,
    );
    expect(target.verify(proof, `${sessionToken}x`, serverSecret)).toBe(false);
    expect(target.verify(proof, sessionToken, `${serverSecret}x`)).toBe(false);
  });
});

describe('cookie-header parsing conformance', () => {
  it.each([
    { header: undefined, name: 'session', expected: null },
    { header: '', name: 'session', expected: null },
    { header: 'session=opaque', name: 'session', expected: 'opaque' },
    {
      header: 'other=one; session=opaque%20token; third=three',
      name: 'session',
      expected: 'opaque token',
    },
    { header: 'session=', name: 'session', expected: null },
    { header: 'session=%E0%A4%A', name: 'session', expected: null },
    {
      header: 'session=first; session=second',
      name: 'session',
      expected: 'first',
    },
    {
      header: 'session=first=second',
      name: 'session',
      expected: 'first=second',
    },
    { header: 'Session=upper', name: 'session', expected: null },
    {
      header: 'malformed; session=valid',
      name: 'session',
      expected: 'valid',
    },
  ])('pins observed realm-adapter behavior for $header', (input) => {
    expect(readCookieValue(input.header, input.name)).toBe(input.expected);
  });
});
