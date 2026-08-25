import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  externalServiceError,
  permissionError,
} from '@pressly/errors/factories';
import {
  authCliUsage,
  pricingCliUsage,
} from '@pressly/experience-control/cli/presentation';
import { makeCliCatalogFromOwners } from '@pressly/generated/cli-catalog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCliClient } from '../../../../experiences/control/src/cli/adapters/api-client.ts';
import { cliFailureFromAppError } from '../../../../experiences/control/src/cli/adapters/outcome.ts';
import { makeAdminSessionStore } from '../../../../experiences/control/src/cli/adapters/session-store.ts';
import {
  runCliRuntime as runHostCliRuntime,
  type RunCliRuntimeInput,
} from '../../../../hosts/cli/src/runtime/process-runtime.ts';
import { nodeCliFileAccess } from '../../../../hosts/cli/src/runtime/filesystem.ts';
import {
  composePresslyCliRuntime,
  type PresslyCliRuntimeOverrides,
} from '../../../../topology/runtime/cli/composition.ts';
import { resolvePresslyCliRuntimeInvocation } from '@pressly/topology/runtime/cli';

const runCliRuntime = (
  input: RunCliRuntimeInput,
  overrides: PresslyCliRuntimeOverrides = {},
) =>
  runHostCliRuntime(input, (assemblyInput) =>
    composePresslyCliRuntime(
      assemblyInput,
      makeCliCatalogFromOwners,
      overrides,
    ),
  );

type CapturedIo = Readonly<{
  io: Readonly<{
    stdout: Readonly<{ write: (chunk: string) => void }>;
    stderr: Readonly<{ write: (chunk: string) => void }>;
  }>;
  stdout: () => string;
  stderr: () => string;
}>;

const captureIo = (): CapturedIo => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: { write: (chunk) => void stdout.push(chunk) },
      stderr: { write: (chunk) => void stderr.push(chunk) },
    },
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
  };
};

const principal = {
  identityId: '00000000-0000-4000-8000-000000000001',
  displayName: 'Steven',
  email: 'steven@example.com',
  roles: ['owner' as const],
};

const session = {
  accessToken: 'token_12345678901234567890123456789012',
  expiresAt: '2026-06-03T12:00:00.000Z',
  principal,
};

const catalog = {
  serviceSlug: 'wash-fold' as const,
  currency: 'USD',
  updatedAt: '2026-08-22T12:00:00.000Z',
  items: [],
};

const plan = {
  serviceSlug: 'wash-fold' as const,
  reason: 'Update tested CLI pricing',
  oldPricingSetId: 'pricing-set-old',
  currency: 'USD',
  changes: [
    {
      code: 'delivery_fee',
      name: 'Delivery fee',
      oldPriceCents: 495,
      newPriceCents: 100,
    },
  ],
};

const published = {
  oldPricingSetId: 'pricing-set-old',
  newPricingSetId: 'pricing-set-new',
  auditEventId: 'audit-event-1',
  changeItemCount: 1,
};

const makeAdminClient = (
  input: Readonly<{
    close?: () => Promise<void>;
    loadSessionFailure?: ReturnType<typeof permissionError>;
    logoutFailure?: ReturnType<typeof externalServiceError>;
  }> = {},
): AdminCliClient => ({
  auth: {
    login: async () => ({ kind: 'success', value: session }),
    completeMfaChallenge: async () => ({ kind: 'success', value: session }),
    loadSession: async () =>
      input.loadSessionFailure === undefined
        ? {
            kind: 'success',
            value: { expiresAt: session.expiresAt, principal },
          }
        : {
            kind: 'failure',
            failure: cliFailureFromAppError(input.loadSessionFailure),
          },
    logout: async () =>
      input.logoutFailure === undefined
        ? { kind: 'success', value: { revoked: true } }
        : {
            kind: 'failure',
            failure: cliFailureFromAppError(input.logoutFailure),
          },
    beginMfaEnrollment: async () => ({
      kind: 'success',
      value: { secret: 'secret', enrollmentUri: 'otpauth://pressly' },
    }),
    confirmMfaEnrollment: async () => ({
      kind: 'success',
      value: { recoveryCodes: ['CODE-1'] },
    }),
    regenerateMfaRecoveryCodes: async () => ({
      kind: 'success',
      value: { recoveryCodes: ['CODE-2'] },
    }),
    removeMfa: async () => ({ kind: 'success', value: { updated: true } }),
  },
  pricing: {
    loadCatalog: async () => ({ kind: 'success', value: catalog }),
    planChange: async () => ({ kind: 'success', value: plan }),
    publishChange: async () => ({ kind: 'success', value: published }),
  },
  close: input.close ?? (async () => undefined),
});

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const sessionPath = async (write = false): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-cli-diff-'));
  directories.push(directory);
  const path = join(directory, 'config', 'admin-session.json');
  if (write)
    await makeAdminSessionStore({ path, files: nodeCliFileAccess }).write(
      session,
    );
  return path;
};

const live = async (
  input: Readonly<{
    argv: readonly string[];
    client?: AdminCliClient;
    environment?: NodeJS.ProcessEnv;
    path?: string;
    stdin?: string;
  }>,
) => {
  const output = captureIo();
  const code = await runCliRuntime(
    {
      invocation: resolvePresslyCliRuntimeInvocation(input.argv),
      environment: input.environment ?? {},
      io: {
        ...output.io,
        ...(input.stdin === undefined
          ? {}
          : {
              stdin: Readable.from([
                input.stdin,
              ]) as unknown as NodeJS.ReadStream,
            }),
      },
      dependencies: {
        ...(input.path === undefined ? {} : { sessionPath: input.path }),
      },
    },
    {
      adminClient: () => input.client ?? makeAdminClient(),
    },
  );
  return { code, stdout: output.stdout(), stderr: output.stderr() };
};

const globalUsage = `${authCliUsage}\n\n${pricingCliUsage}\n`;
const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const releasedBoundary = (
  argv: readonly string[],
): Readonly<{ code: number; stdout: string; stderr: string }> => {
  const key = argv.join('\u0000');
  if (key === '' || key === '--help')
    return { code: 0, stdout: globalUsage, stderr: '' };
  if (key === 'auth\u0000--help')
    return { code: 0, stdout: `${authCliUsage}\n`, stderr: '' };
  if (key === 'pricing\u0000-h')
    return { code: 0, stdout: `${pricingCliUsage}\n`, stderr: '' };
  if (key === 'unknown' || key === 'unknown\u0000--json')
    return {
      code: 1,
      stdout: '',
      stderr: `Unknown command namespace: unknown.\n\n${globalUsage}`,
    };
  if (key === 'auth\u0000unknown' || key === 'auth\u0000unknown\u0000--json')
    return {
      code: 1,
      stdout: '',
      stderr: `Expected a supported auth action.\n\n${authCliUsage}\n`,
    };
  if (key === 'pricing\u0000unknown')
    return {
      code: 1,
      stdout: '',
      stderr: `Expected pricing action: show, plan, or publish.\n\n${pricingCliUsage}\n`,
    };
  return {
    code: 1,
    stdout: '',
    stderr: `Unknown option '--unknown'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--unknown"\n\n${authCliUsage}\n`,
  };
};

const releasedLogin = {
  code: 0,
  stdout: [
    'Signed in as Steven.',
    `Identity: ${principal.identityId}`,
    'Roles: owner',
    `Expires: ${session.expiresAt}`,
    '',
  ].join('\n'),
  stderr: '',
};

describe('released/live admin CLI contract', () => {
  it('pins the exact released program help bytes', () => {
    expect([Buffer.byteLength(globalUsage), sha256(globalUsage)]).toEqual([
      1303,
      '9d0af095d95235cba8715a26aa726b78defb1ba2b67b36bb6069eca0c7362aad',
    ]);
    expect([
      Buffer.byteLength(`${authCliUsage}\n`),
      sha256(`${authCliUsage}\n`),
    ]).toEqual([
      737,
      '00aa7c484bb1603841c8df7b6718a517c61ca7118c15099afc8c363f44a581c5',
    ]);
    expect([
      Buffer.byteLength(`${pricingCliUsage}\n`),
      sha256(`${pricingCliUsage}\n`),
    ]).toEqual([
      565,
      '28a2406897305e3d9bf781e4acb1b1c83e0283c9717fc207655fe75be7c3db3c',
    ]);
    expect(authCliUsage).not.toMatch(
      /--(?:password|mfa-code|recovery-code|code)\b|123456/,
    );
  });

  it('rejects secret-bearing argv and oversized login stdin before client execution', async () => {
    const close = vi.fn(async () => undefined);
    const client = makeAdminClient({ close });
    for (const argv of [
      [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--password',
        'never-echo-this-password',
      ],
      [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--mfa-code',
        '654321',
      ],
      ['auth', 'mfa-confirm', '--code', '654321'],
      ['auth', 'login', 'never-echo-this-positional-secret'],
    ]) {
      const result = await live({ argv, client, path: await sessionPath() });
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toMatch(
        /never-echo-this-password|never-echo-this-positional-secret|654321/,
      );
    }

    const oversized = await live({
      argv: [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--secret-stdin',
      ],
      client,
      path: await sessionPath(),
      stdin: 'x'.repeat(4_097),
    });
    expect(oversized).toMatchObject({ code: 1, stdout: '' });
    expect(oversized.stderr).toContain('Standard input exceeds 4096 bytes.');
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    [],
    ['--help'],
    ['auth', '--help'],
    ['pricing', '-h'],
    ['unknown'],
    ['unknown', '--json'],
    ['auth', 'unknown'],
    ['auth', 'unknown', '--json'],
    ['pricing', 'unknown'],
    ['auth', 'login', '--unknown'],
  ])(
    'preserves exact help, unknown, and invalid bytes for %j',
    async (...argv) => {
      const normalized = argv as readonly string[];
      await expect(live({ argv: normalized })).resolves.toEqual(
        releasedBoundary(normalized),
      );
    },
  );

  it('preserves auth and pricing plain/JSON output bytes', async () => {
    const loginArgv = [
      'auth',
      'login',
      '--email',
      'steven@example.com',
      '--secret-stdin',
    ];
    await expect(
      live({
        argv: loginArgv,
        path: await sessionPath(),
        stdin: JSON.stringify({ password: 'password-123' }),
      }),
    ).resolves.toEqual(releasedLogin);

    await expect(
      live({
        argv: ['auth', 'mfa-confirm', '--secret-stdin'],
        client: makeAdminClient(),
        path: await sessionPath(true),
        stdin: '123456\n',
      }),
    ).resolves.toEqual({
      code: 0,
      stdout:
        'MFA recovery codes\n\nCODE-1\n\nStore these offline. They will not be shown again.\n',
      stderr: '',
    });

    const planArgv = [
      'pricing',
      'plan',
      '--service',
      'wash-fold',
      '--set',
      'delivery_fee=1.00',
      '--reason',
      'Update tested CLI pricing',
      '--json',
    ];
    await expect(
      live({ argv: planArgv, path: await sessionPath(true) }),
    ).resolves.toEqual({
      code: 0,
      stdout: `${JSON.stringify(plan, null, 2)}\n`,
      stderr: '',
    });
  });

  it('preserves command-error priority over close and reports close-only failure after stdout', async () => {
    const closeFailure = externalServiceError({
      code: 'client_close_failed',
      message: 'Client close failed.',
      safeMessage: 'Could not close the CLI client.',
      status: 502,
    });
    const successfulArgv = [
      'auth',
      'login',
      '--email',
      'steven@example.com',
      '--secret-stdin',
    ];
    await expect(
      live({
        argv: successfulArgv,
        path: await sessionPath(),
        stdin: JSON.stringify({ password: 'password-123' }),
        client: makeAdminClient({
          close: async () => {
            throw closeFailure;
          },
        }),
      }),
    ).resolves.toEqual({
      ...releasedLogin,
      code: 1,
      stderr: 'Could not close the CLI client.\n',
    });

    const denied = permissionError({
      code: 'session_denied',
      message: 'Session denied.',
      safeMessage: 'Session denied.',
    });
    const storedSessionPath = await sessionPath(true);
    await expect(
      live({
        argv: ['auth', 'session'],
        path: storedSessionPath,
        client: makeAdminClient({
          loadSessionFailure: denied,
          close: async () => {
            throw closeFailure;
          },
        }),
      }),
    ).resolves.toEqual({
      code: 1,
      stdout: '',
      stderr: 'Session denied.\n',
    });
  });

  it('writes successful command bytes before closing the command-scoped client', async () => {
    const events: string[] = [];
    const path = await sessionPath();
    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'auth',
          'login',
          '--email',
          'steven@example.com',
          '--secret-stdin',
        ]),
        environment: {},
        io: {
          stdin: Readable.from([
            JSON.stringify({ password: 'password-123' }),
          ]) as unknown as NodeJS.ReadStream,
          stdout: { write: () => void events.push('stdout') },
          stderr: { write: () => void events.push('stderr') },
        },
        dependencies: {
          sessionPath: path,
        },
      },
      {
        adminClient: () =>
          makeAdminClient({
            close: async () => void events.push('close'),
          }),
      },
    );

    expect(code).toBe(0);
    expect(events).toEqual(['stdout', 'close']);
  });

  it('does not create a client for help/unknown/parse failures and closes once per valid command', async () => {
    const create = vi.fn(() => makeAdminClient());
    for (const argv of [
      ['--help'],
      ['unknown'],
      ['auth', 'login', '--unknown'],
    ]) {
      const output = captureIo();
      await runCliRuntime(
        {
          invocation: resolvePresslyCliRuntimeInvocation(argv),
          environment: {},
          io: output.io,
        },
        { adminClient: create },
      );
    }
    expect(create).not.toHaveBeenCalled();

    const close = vi.fn(async () => undefined);
    await live({
      argv: [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--secret-stdin',
      ],
      path: await sessionPath(),
      client: makeAdminClient({ close }),
      stdin: JSON.stringify({ password: 'password-123' }),
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('validates the command-scoped API URL before executing owner validation', async () => {
    const outcome = await live({
      argv: [
        'auth',
        'login',
        '--email',
        'steven@example.com',
        '--secret-stdin',
      ],
      environment: { PRESSLY_API_URL: 'not a url' },
      path: await sessionPath(),
      stdin: JSON.stringify({ password: 'password-123' }),
    });

    expect(outcome).toEqual({
      code: 1,
      stdout: '',
      stderr: 'PRESSLY_API_URL must be a valid URL.\n',
    });
  });

  it('clears logout session bytes only after a successful remote revoke', async () => {
    const path = await sessionPath(true);
    const remoteFailure = externalServiceError({
      code: 'logout_failed',
      message: 'Remote logout failed.',
      safeMessage: 'Remote logout failed.',
      status: 502,
    });
    await live({
      argv: ['auth', 'logout'],
      path,
      client: makeAdminClient({ logoutFailure: remoteFailure }),
    });
    await expect(stat(path)).resolves.toBeDefined();

    await live({
      argv: ['auth', 'logout'],
      path,
      client: makeAdminClient(),
    });
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
