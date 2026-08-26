import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlCliAuthApiBeginMfaEnrollmentV1,
  controlCliAuthApiCompleteMfaChallengeV1,
  controlCliAuthApiConfirmMfaEnrollmentV1,
  controlCliAuthApiLoadSessionV1,
  controlCliAuthApiLoginV1,
  controlCliAuthApiLogoutV1,
  controlCliAuthApiRegenerateMfaRecoveryCodesV1,
  controlCliAuthApiRemoveMfaV1,
} from '@pressly/topology/browser-operations';
import {
  makeAdminCliClientFactory,
  readAdminApiUrl,
} from '../../../../experiences/control/src/cli/adapters/api-client.ts';
import { makeAdminSessionStore } from '../../../../experiences/control/src/cli/adapters/session-store.ts';
import { nodeCliFileAccess } from '../../../../hosts/cli/src/runtime/filesystem.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const temporarySessionPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-cli-runtime-'));
  directories.push(directory);
  return join(directory, 'nested', 'admin-session.json');
};

const session = {
  accessToken: 'token_12345678901234567890123456789012',
  expiresAt: '2026-06-03T12:00:00.000Z',
  principal: {
    identityId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Steven',
    email: 'steven@example.com',
    roles: ['owner'],
  },
};

describe('CLI session adapter', () => {
  it('validates session bytes and preserves directory/file modes and clear', async () => {
    const path = await temporarySessionPath();
    const store = makeAdminSessionStore({ path, files: nodeCliFileAccess });

    await expect(store.read()).resolves.toEqual({
      kind: 'success',
      value: undefined,
    });
    await expect(store.write(session)).resolves.toEqual({
      kind: 'success',
      value: undefined,
    });
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, 'utf8')).toBe(
      `${JSON.stringify(session, null, 2)}\n`,
    );
    await expect(store.read()).resolves.toEqual({
      kind: 'success',
      value: session,
    });
    await expect(store.clear()).resolves.toEqual({
      kind: 'success',
      value: undefined,
    });
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns a safe failure for malformed or schema-invalid session files', async () => {
    const path = await temporarySessionPath();
    await writeFile(path, '{not-json', { encoding: 'utf8', flag: 'w' }).catch(
      async () => {
        const store = makeAdminSessionStore({
          path,
          files: nodeCliFileAccess,
        });
        await store.write(session);
        await writeFile(path, '{not-json', 'utf8');
      },
    );

    await expect(
      makeAdminSessionStore({ path, files: nodeCliFileAccess }).read(),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'diagnostic',
        code: 'session_store_failed',
        message: 'Could not access CLI session storage.',
      },
    });
  });
});

describe('CLI API adapter', () => {
  it('requires credential-free HTTPS except for exact loopback HTTP', () => {
    expect(readAdminApiUrl({}).toString()).toBe('http://localhost:4000/');
    expect(
      readAdminApiUrl({
        PRESSLY_API_URL: '  https://api.example.test/v1  ',
      }).toString(),
    ).toBe('https://api.example.test/v1');
    expect(
      readAdminApiUrl({ PRESSLY_API_URL: 'http://127.0.0.1:4000' }).toString(),
    ).toBe('http://127.0.0.1:4000/');
    expect(
      readAdminApiUrl({ PRESSLY_API_URL: 'http://[::1]:4000' }).toString(),
    ).toBe('http://[::1]:4000/');
    expect(() => readAdminApiUrl({ PRESSLY_API_URL: 'not a url' })).toThrow(
      expect.objectContaining({
        code: 'invalid_api_url',
        safeMessage: 'PRESSLY_API_URL must be a valid URL.',
      }),
    );
    for (const value of [
      'http://api.example.test',
      'http://localhost.example.test:4000',
      'http://127.0.0.2:4000',
      'ftp://localhost/resource',
    ])
      expect(() => readAdminApiUrl({ PRESSLY_API_URL: value })).toThrow(
        expect.objectContaining({
          code: 'insecure_api_url',
          safeMessage:
            'PRESSLY_API_URL must use HTTPS, except for local loopback development.',
        }),
      );

    const credentialUrl = 'https://operator:do-not-disclose@api.example.test';
    let credentialError: unknown;
    try {
      readAdminApiUrl({ PRESSLY_API_URL: credentialUrl });
    } catch (error: unknown) {
      credentialError = error;
    }
    expect(credentialError).toMatchObject({
      code: 'api_url_credentials_forbidden',
      safeMessage: 'PRESSLY_API_URL must not contain credentials.',
    });
    expect(JSON.stringify(credentialError)).not.toContain('do-not-disclose');
  });

  it('maps exact auth/pricing paths, bearer headers, bodies, and envelopes', async () => {
    const requests: Readonly<{ url: string; init?: RequestInit }>[] = [];
    const fetch: typeof globalThis.fetch = vi.fn(async (url, init) => {
      requests.push({
        url: String(url),
        ...(init === undefined ? {} : { init }),
      });
      const path = new URL(String(url)).pathname;
      const data = path.includes('/pricing/services/')
        ? {
            serviceSlug: 'wash-fold',
            currency: 'USD',
            updatedAt: '2026-08-22T12:00:00.000Z',
            items: [],
          }
        : path === '/control/cli/auth/login' ||
            path === '/control/cli/auth/mfa/challenge'
          ? session
          : path === '/control/cli/auth/session'
            ? {
                expiresAt: session.expiresAt,
                principal: session.principal,
              }
            : path === '/control/cli/auth/mfa/enrollment'
              ? {
                  secret: 'a'.repeat(32),
                  enrollmentUri: 'otpauth://totp/Pressly:owner',
                }
              : path === '/control/cli/auth/mfa/enrollment/confirm' ||
                  path === '/control/cli/auth/mfa/recovery-codes/regenerate'
                ? { recoveryCodes: ['recovery-code'] }
                : path === '/control/cli/auth/mfa/remove'
                  ? { updated: true }
                  : { revoked: true };
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = makeAdminCliClientFactory(fetch)(
      new URL('https://api.example.test/root'),
    );

    await expect(
      client.auth.login({
        email: 'steven@example.com',
        password: 'password-123',
      }),
    ).resolves.toMatchObject({ kind: 'success', value: session });
    await expect(
      client.auth.completeMfaChallenge({
        challengeToken: 'challenge-token',
        method: 'totp',
        code: '123456',
      }),
    ).resolves.toMatchObject({ kind: 'success', value: session });
    await expect(
      client.auth.loadSession(session.accessToken),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { principal: session.principal },
    });
    await expect(
      client.auth.beginMfaEnrollment(session.accessToken),
    ).resolves.toMatchObject({ kind: 'success' });
    await expect(
      client.auth.confirmMfaEnrollment(session.accessToken, '123456'),
    ).resolves.toMatchObject({ kind: 'success' });
    await expect(
      client.auth.regenerateMfaRecoveryCodes(session.accessToken),
    ).resolves.toMatchObject({ kind: 'success' });
    await expect(
      client.auth.removeMfa(session.accessToken),
    ).resolves.toMatchObject({ kind: 'success' });
    await expect(
      client.pricing.loadCatalog(session.accessToken, 'wash-fold'),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { serviceSlug: 'wash-fold' },
    });
    await expect(client.auth.logout(session.accessToken)).resolves.toEqual({
      kind: 'success',
      value: { revoked: true },
    });

    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      controlCliAuthApiLoginV1.http.login.path,
      controlCliAuthApiCompleteMfaChallengeV1.http.challenge.path,
      controlCliAuthApiLoadSessionV1.http.session.path,
      controlCliAuthApiBeginMfaEnrollmentV1.http.enrollment.path,
      controlCliAuthApiConfirmMfaEnrollmentV1.http.confirm.path,
      controlCliAuthApiRegenerateMfaRecoveryCodesV1.http.regenerate.path,
      controlCliAuthApiRemoveMfaV1.http.remove.path,
      '/pricing/services/wash-fold/pricing',
      controlCliAuthApiLogoutV1.http.logout.path,
    ]);
    expect(requests[0]?.init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'steven@example.com',
        password: 'password-123',
      }),
    });
    expect(requests[2]?.init).toMatchObject({
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(requests[4]?.init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
  });

  it('preserves safe API failure code, trace, and public details', async () => {
    const fetch: typeof globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'access_denied',
              message: 'Access denied.',
              traceId: 'trace-envelope',
              details: { capability: 'pricing.publish' },
            },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
    );
    const client = makeAdminCliClientFactory(fetch)(
      new URL('https://api.example.test'),
    );

    await expect(client.auth.loadSession(session.accessToken)).resolves.toEqual(
      {
        kind: 'failure',
        failure: {
          kind: 'diagnostic',
          code: 'access_denied',
          message: 'Access denied.',
          traceId: 'trace-envelope',
          details: { capability: 'pricing.publish' },
        },
      },
    );
  });
});
