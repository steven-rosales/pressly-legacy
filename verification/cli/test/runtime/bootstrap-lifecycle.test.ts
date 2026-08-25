import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { PostgresRuntime } from '@pressly/postgres/client';
import type { PresslyPostgresSchema } from '@pressly/topology/postgres-schema';
import * as result from '@pressly/cells/result';
import { uuidIdSource } from '@pressly/cells/id-source/node';
import { systemClock } from '@pressly/time';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCliCatalogFromOwners } from '@pressly/generated/cli-catalog';
import {
  runCliRuntime as runHostCliRuntime,
  type CliIo,
} from '../../../../hosts/cli/src/runtime/process-runtime.ts';
import { resolvePresslyCliRuntimeInvocation } from '@pressly/topology/runtime/cli';
import {
  composePresslyCliRuntime,
  type PresslyCliRuntimeOverrides,
} from '../../../../topology/runtime/cli/composition.ts';

const runCliRuntime = (
  input: Parameters<typeof runHostCliRuntime>[0],
  overrides: PresslyCliRuntimeOverrides = {},
) =>
  runHostCliRuntime(input, (assemblyInput) =>
    composePresslyCliRuntime(
      assemblyInput,
      makeCliCatalogFromOwners,
      overrides,
    ),
  );

type ProductionAuthorityFactory = NonNullable<
  PresslyCliRuntimeOverrides['productionAuthorities']
>;

const captureIo = (stdin?: NodeJS.ReadStream) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = {
    ...(stdin === undefined ? {} : { stdin }),
    stdout: { write: (chunk: string) => void stdout.push(chunk) },
    stderr: { write: (chunk: string) => void stderr.push(chunk) },
  };
  return {
    io,
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
  };
};

const redirectedChunks = (
  values: readonly string[],
  onRead: () => void = () => undefined,
): NodeJS.ReadStream =>
  Readable.from(
    (async function* () {
      for (const value of values) {
        onRead();
        yield value;
      }
    })(),
  ) as unknown as NodeJS.ReadStream;

const redirected = (
  value: string,
  onRead: () => void = () => undefined,
): NodeJS.ReadStream => redirectedChunks([value], onRead);

const controlledRedirectedChunks = (
  values: readonly string[],
  onRead: () => void,
): NodeJS.ReadStream => {
  let index = 0;
  const iterator = {
    next: async () => {
      const value = values[index];
      if (value === undefined) return { done: true as const, value: undefined };
      index += 1;
      onRead();
      return { done: false as const, value };
    },
    return: async () => {
      index = values.length;
      return { done: true as const, value: undefined };
    },
  };
  return {
    isTTY: false,
    pause: () => undefined,
    destroy: () => undefined,
    [Symbol.asyncIterator]: () => iterator,
  } as unknown as NodeJS.ReadStream;
};

const database = (
  close: () => Promise<void>,
): PostgresRuntime<PresslyPostgresSchema> =>
  ({
    db: {
      transaction: async (work: (transaction: unknown) => Promise<unknown>) =>
        work({ execute: async () => [] }),
    },
    check: async () => undefined,
    listen: async () => async () => undefined,
    close,
  }) as unknown as PostgresRuntime<PresslyPostgresSchema>;

const manifest = {
  schemaVersion: 1,
  location: {
    id: 'location-test',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Synthetic Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  sourceLocationBindings: [
    {
      source: 'cents',
      externalLocationId: 'store-test',
      locationId: 'location-test',
      isActive: true,
    },
  ],
  stations: ['sorting', 'washing', 'drying', 'folding_packaging'].map(
    (kind, sortOrder) => ({
      locationId: 'location-test',
      kind,
      label: kind,
      sortOrder,
      isActive: true,
    }),
  ),
  machines: [
    {
      locationId: 'location-test',
      stationKind: 'washing',
      label: 'Washer test',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 54,
      capacitySafetyMarginLbs: 6,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId: 'location-test',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const writeManifest = async (value: unknown = manifest): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-cli-bootstrap-'));
  directories.push(directory);
  const file = join(directory, 'manifest.json');
  await writeFile(file, JSON.stringify(value), 'utf8');
  return file;
};

describe('bootstrap argv and owner lifecycle', () => {
  it('prefixes synthetic commands and removes every package-run separator', () => {
    expect(
      resolvePresslyCliRuntimeInvocation([
        'bootstrap',
        'owner',
        '--',
        '--password-stdin',
        '--',
      ]).argv,
    ).toEqual(['bootstrap', 'owner', '--password-stdin']);
    expect(
      resolvePresslyCliRuntimeInvocation([
        'bootstrap',
        'production',
        '--',
        '--file',
        'manifest.json',
        '--',
      ]).argv,
    ).toEqual(['bootstrap', 'production', '--file', 'manifest.json']);
  });

  it('opens one max-1 DB before bounded stdin, maps env/context, and closes finally', async () => {
    const events: string[] = [];
    const options: unknown[] = [];
    const ownerPassword = 'CorrectHorse1!Battery';
    const output = captureIo(
      redirected(`${ownerPassword}\n`, () => events.push('stdin')),
    );
    const environment = {
      DATABASE_URL: 'postgres://runtime-owner',
      PRESSLY_BOOTSTRAP_BUSINESS_ID: ' 00000000-0000-4000-8000-000000000100 ',
      PRESSLY_BOOTSTRAP_BUSINESS_SLUG: ' pressly-one ',
      PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME: ' Pressly One ',
      PRESSLY_BOOTSTRAP_OWNER_EMAIL: 'owner@example.com',
      PRESSLY_BOOTSTRAP_OWNER_CONFIRM: 'BOOTSTRAP',
    };
    const expectedCommand = {
      businessId: '00000000-0000-4000-8000-000000000100',
      businessSlug: 'pressly-one',
      businessDisplayName: 'Pressly One',
      email: 'owner@example.com',
      password: ownerPassword,
      confirmation: 'BOOTSTRAP',
    };
    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'bootstrap',
          'owner',
          '--',
          '--password-stdin',
        ]),
        environment,
        io: output.io,
        dependencies: {
          database: (input) => {
            events.push('database');
            options.push(input);
            return database(async () => void events.push('close'));
          },
        },
      },
      {
        bootstrapOwner: () => async (command) => {
          events.push('owner');
          expect(command).toEqual(expectedCommand);
          return result.ok({
            identityId: '00000000-0000-4000-8000-000000000001',
            email: command.email,
            role: 'owner' as const,
            replayed: false,
          });
        },
      },
    );

    expect(code).toBe(0);
    expect(events).toEqual(['database', 'stdin', 'owner', 'close']);
    expect(options).toEqual([
      {
        databaseUrl: 'postgres://runtime-owner',
        maxConnections: 1,
      },
    ]);
    expect(output.stdout()).toBe(
      '{"identityId":"00000000-0000-4000-8000-000000000001","email":"owner@example.com","role":"owner","replayed":false}\n',
    );
    expect(output.stderr()).toBe('');
  });

  it('rejects oversized owner stdin without invoking Access and still closes the database', async () => {
    const close = vi.fn(async () => undefined);
    const bootstrapOwner = vi.fn();
    let chunksRead = 0;
    const output = captureIo(
      controlledRedirectedChunks(
        ['p'.repeat(2_048), 'p'.repeat(2_048), 'pp', 'unread'],
        () => {
          chunksRead += 1;
        },
      ),
    );

    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'bootstrap',
          'owner',
          '--password-stdin',
        ]),
        environment: {
          DATABASE_URL: 'postgres://runtime-owner',
          PRESSLY_BOOTSTRAP_BUSINESS_ID: '00000000-0000-4000-8000-000000000100',
          PRESSLY_BOOTSTRAP_BUSINESS_SLUG: 'pressly-one',
          PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME: 'Pressly One',
          PRESSLY_BOOTSTRAP_OWNER_EMAIL: 'owner@example.com',
          PRESSLY_BOOTSTRAP_OWNER_CONFIRM: 'BOOTSTRAP',
        },
        io: output.io,
        dependencies: { database: () => database(close) },
      },
      { bootstrapOwner: () => bootstrapOwner as never },
    );

    expect(code).toBe(1);
    expect(bootstrapOwner).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(chunksRead).toBe(3);
    expect(output.stderr()).toBe('Standard input exceeds 4096 bytes.\n');
  });

  it('aborts streaming owner stdin without invoking Access and closes the database', async () => {
    const close = vi.fn(async () => undefined);
    const bootstrapOwner = vi.fn();
    const controller = new AbortController();
    const output = captureIo(
      controlledRedirectedChunks(['partial-password', 'unread'], () => {
        controller.abort();
      }),
    );

    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'bootstrap',
          'owner',
          '--password-stdin',
        ]),
        environment: {
          DATABASE_URL: 'postgres://runtime-owner',
          PRESSLY_BOOTSTRAP_BUSINESS_ID: '00000000-0000-4000-8000-000000000100',
          PRESSLY_BOOTSTRAP_BUSINESS_SLUG: 'pressly-one',
          PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME: 'Pressly One',
          PRESSLY_BOOTSTRAP_OWNER_EMAIL: 'owner@example.com',
          PRESSLY_BOOTSTRAP_OWNER_CONFIRM: 'BOOTSTRAP',
        },
        io: output.io,
        dependencies: {
          database: () => database(close),
          signal: controller.signal,
        },
      },
      { bootstrapOwner: () => bootstrapOwner as never },
    );

    expect(code).toBe(1);
    expect(bootstrapOwner).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(output.stderr()).toBe('An unexpected error occurred.\n');
  });

  it('does not construct a DB for invalid owner argv and emits debug diagnostics on failure', async () => {
    const createDatabase = vi.fn(() => database(async () => undefined));
    const invalid = captureIo(redirected('password\n'));
    await runCliRuntime({
      invocation: resolvePresslyCliRuntimeInvocation([
        'bootstrap',
        'owner',
        '--password-stdin',
        '--unexpected',
      ]),
      environment: { DATABASE_URL: 'postgres://runtime-owner' },
      io: invalid.io,
      dependencies: { database: createDatabase },
    });
    expect(createDatabase).not.toHaveBeenCalled();

    const debug = captureIo(redirected('password\n'));
    const code = await runCliRuntime({
      invocation: resolvePresslyCliRuntimeInvocation([
        'bootstrap',
        'owner',
        '--password-stdin',
      ]),
      environment: {
        DATABASE_URL: 'postgres://runtime-owner',
        PRESSLY_BOOTSTRAP_BUSINESS_SLUG: 'pressly-one',
        PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME: 'Pressly One',
        PRESSLY_DEBUG_BOOTSTRAP_OWNER: '1',
      },
      io: debug.io,
      dependencies: { database: createDatabase },
    });
    expect(code).toBe(1);
    expect(debug.stderr()).toMatch(
      /^PRESSLY_BOOTSTRAP_OWNER_EMAIL is required\.\nConfigError:/,
    );
  });
});

describe('production bootstrap lifecycle', () => {
  it('maps the 1 MiB manifest, injects clock/UUID, runs preview-preview/apply-apply, and closes', async () => {
    const file = await writeManifest();
    const events: string[] = [];
    const options: unknown[] = [];
    const commandArgv = [
      '--',
      '--file',
      file,
      '--actor-id',
      '11111111-1111-4111-8111-111111111111',
      '--idempotency-key',
      'bootstrap-test-1',
      '--apply',
    ];
    const productionValue = (dryRun: boolean) => ({
      mode: dryRun ? ('dry_run' as const) : ('apply' as const),
      configurationHash: 'a'.repeat(64),
      operations: [],
      summary: { created: 0, updated: 0, noop: 0, rejected: 0 },
      replayed: false,
      status: 'converged' as const,
      rejections: [] as const,
      applied: !dryRun,
    });
    const bindingsValue = (dryRun: boolean) => ({
      mode: dryRun ? ('dry_run' as const) : ('apply' as const),
      status: 'converged' as const,
      applied: !dryRun,
      operations: [],
      rejections: [],
    });
    const locationValue = (dryRun: boolean) => ({
      mode: dryRun ? ('dry_run' as const) : ('apply' as const),
      status: 'converged' as const,
      applied: !dryRun,
      operation: null,
      rejections: [],
    });
    const releasedResult = {
      location: locationValue(false),
      production: productionValue(false),
      sourceLocationBindings: bindingsValue(false),
    };
    const authority: ProductionAuthorityFactory = (input) => {
      expect(input.clock).toBe(systemClock);
      expect(input.ids).toBe(uuidIdSource);
      events.push('assemble');
      return {
        manageLocation: async (command) => {
          events.push(`location:${command.dryRun ? 'preview' : 'apply'}`);
          expect(command.location).toEqual(manifest.location);
          return {
            kind: 'success',
            value: locationValue(command.dryRun),
          };
        },
        manageProduction: async (command) => {
          events.push(`production:${command.dryRun ? 'preview' : 'apply'}`);
          expect(command.manifest).not.toHaveProperty('sourceLocationBindings');
          return {
            kind: 'success',
            value: productionValue(command.dryRun),
          };
        },
        manageSourceLocationBindings: async (command) => {
          events.push(`bindings:${command.dryRun ? 'preview' : 'apply'}`);
          expect(command.manifest.sourceLocationBindings).toEqual([
            manifest.sourceLocationBindings[0],
          ]);
          return {
            kind: 'success',
            value: bindingsValue(command.dryRun),
          };
        },
      };
    };
    const output = captureIo();
    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'bootstrap',
          'production',
          ...commandArgv,
        ]),
        environment: { DATABASE_URL: 'postgres://runtime-production' },
        io: output.io,
        dependencies: {
          database: (input) => {
            options.push(input);
            events.push('database');
            return database(async () => void events.push('close'));
          },
        },
      },
      { productionAuthorities: authority },
    );

    expect(code).toBe(0);
    expect(options).toEqual([
      {
        databaseUrl: 'postgres://runtime-production',
        maxConnections: 2,
      },
    ]);
    expect(events).toEqual([
      'database',
      'assemble',
      'location:preview',
      'production:preview',
      'bindings:preview',
      'location:apply',
      'production:apply',
      'bindings:apply',
      'close',
    ]);
    expect(JSON.parse(output.stdout())).toMatchObject({
      location: { mode: 'apply', applied: true },
      production: { mode: 'apply', applied: true },
      sourceLocationBindings: { mode: 'apply', applied: true },
    });
    expect(output.stdout()).toBe(
      `${JSON.stringify(releasedResult, null, 2)}\n`,
    );
    expect(output.stderr()).toBe('');
  });

  it('checks the post-read byte ceiling and closes the DB on manifest failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pressly-cli-bootstrap-'));
    directories.push(directory);
    const file = join(directory, 'oversized.json');
    await writeFile(file, ' '.repeat(1_048_577), 'utf8');
    const close = vi.fn(async () => undefined);
    const output = captureIo();
    const code = await runCliRuntime(
      {
        invocation: resolvePresslyCliRuntimeInvocation([
          'bootstrap',
          'production',
          '--file',
          file,
          '--actor-id',
          '11111111-1111-4111-8111-111111111111',
          '--idempotency-key',
          'bootstrap-test-1',
        ]),
        environment: { DATABASE_URL: 'postgres://runtime-production' },
        io: output.io,
        dependencies: {
          database: () => database(close),
        },
      },
      {
        productionAuthorities: () => ({
          manageLocation: vi.fn(),
          manageProduction: vi.fn(),
          manageSourceLocationBindings: vi.fn(),
        }),
      },
    );

    expect(code).toBe(1);
    expect(output.stderr()).toBe(
      'Production bootstrap input exceeds one MiB.\n',
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
