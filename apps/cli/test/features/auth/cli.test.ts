import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import type { AuthPrincipalResult } from '@pressly/contracts';

import {
  makeAuthCli,
  type AuthCliClient,
  type AuthCliDeps,
} from '../../../src/features/auth/index.ts';
import { parseAuthCliCommand } from '../../../src/features/auth/args.ts';
import type { CliIO } from '../../../src/shell/io.ts';
import { runCli } from '../../../src/shell/run-cli.ts';
import { makeTestIo } from '../../support/io.ts';

const makeFakeClient = () => {
  const calls = {
    login: 0,
    session: 0,
    logout: 0,
    mfaEnroll: 0,
    mfaConfirm: 0,
    mfaRecoveryCodes: 0,
    mfaRemove: 0,
    close: 0,
  };

  const principal: AuthPrincipalResult = {
    identityId: '00000000-0000-0000-0000-000000000001',
    displayName: 'Steven',
    email: 'steven@example.com',
    roles: ['owner'],
  };

  const client: AuthCliClient = {
    login: async () => {
      calls.login += 1;

      return result.ok({
        accessToken: 'token_12345678901234567890123456789012',
        expiresAt: '2026-06-03T12:00:00.000Z',
        principal,
      });
    },
    loadSession: async () => {
      calls.session += 1;

      return result.ok({
        expiresAt: '2026-06-03T12:00:00.000Z',
        principal,
      });
    },
    logout: async () => {
      calls.logout += 1;

      return result.ok({ revoked: true });
    },
    beginMfaEnrollment: async () => {
      calls.mfaEnroll += 1;
      return result.ok({
        secret: 'BASE32SECRETVALUE',
        enrollmentUri: 'otpauth://totp/Pressly:Steven?secret=BASE32SECRETVALUE',
      });
    },
    confirmMfaEnrollment: async () => {
      calls.mfaConfirm += 1;
      return result.ok({ recoveryCodes: ['AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'] });
    },
    regenerateMfaRecoveryCodes: async () => {
      calls.mfaRecoveryCodes += 1;
      return result.ok({ recoveryCodes: ['FFFF-EEEE-DDDD-CCCC-BBBB-AAAA'] });
    },
    removeMfa: async () => {
      calls.mfaRemove += 1;
      return result.ok({ updated: true });
    },
    close: async () => {
      calls.close += 1;
    },
  };

  return { calls, client };
};

const runTestAuthCli = (
  argv: readonly string[],
  io: CliIO,
  deps: AuthCliDeps,
): Promise<number> =>
  runCli({
    argv,
    env: {},
    io,
    features: [makeAuthCli(deps)],
  });

describe('auth CLI', () => {
  it('parses login credentials', () => {
    const parseResult = parseAuthCliCommand([
      'auth',
      'login',
      '--email',
      'steven@example.com',
      '--password',
      'password-123',
    ]);

    expect(result.isOk(parseResult)).toBe(true);

    if (result.isOk(parseResult) && parseResult.value !== 'help') {
      expect(parseResult.value.action).toBe('login');
      expect(parseResult.value.email).toBe('steven@example.com');
      expect(parseResult.value.password).toBe('password-123');
    }
  });

  it('runs login through the injected auth client', async () => {
    const fake = makeFakeClient();
    const io = makeTestIo();
    const exitCode = await runTestAuthCli(
      [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--password',
        'password-123',
      ],
      io,
      { makeAuthClient: () => result.ok(fake.client) },
    );

    expect(exitCode).toBe(0);
    expect(fake.calls.login).toBe(1);
    expect(fake.calls.close).toBe(1);
    expect(io.stdout.text()).toMatch(/Signed in as Steven/);
  });

  it('runs logout through the injected auth client', async () => {
    const fake = makeFakeClient();
    const io = makeTestIo();
    const exitCode = await runTestAuthCli(['auth', 'logout'], io, {
      makeAuthClient: () => result.ok(fake.client),
    });

    expect(exitCode).toBe(0);
    expect(fake.calls.logout).toBe(1);
    expect(fake.calls.close).toBe(1);
    expect(io.stdout.text()).toMatch(/Logged out/);
  });

  it('parses MFA login and enrollment commands', () => {
    const login = parseAuthCliCommand([
      'auth',
      'login',
      '--email',
      'steven@example.com',
      '--password',
      'password-123',
      '--mfa-code',
      '123456',
    ]);
    const confirm = parseAuthCliCommand([
      'auth',
      'mfa-confirm',
      '--code',
      '123456',
    ]);

    expect(login).toMatchObject({
      tag: 'ok',
      value: { action: 'login', mfaCode: '123456' },
    });
    expect(confirm).toMatchObject({
      tag: 'ok',
      value: { action: 'mfa-confirm', code: '123456' },
    });
  });
});
