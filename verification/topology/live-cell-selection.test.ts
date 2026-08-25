import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import { compileTopology } from '../../topology/src/compiler.ts';
import {
  composePresslyCliRuntime,
  type PresslyCliRuntimeOwners,
} from '../../topology/runtime/cli/composition.ts';
import {
  makeApiTargetOwners,
  type ApiTargetOwnerCompositionDependencies,
} from '../../topology/runtime/http/bootstrap/target-owners.ts';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

type LiveCell = Readonly<{ id: string }>;
type LiveOwner = Readonly<{
  cells: Readonly<Record<string, LiveCell>>;
}>;

const cellFilesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return cellFilesUnder(entryPath);
    return entry.isFile() && entry.name === 'cell.ts' ? [entryPath] : [];
  });

const isCellDeclaration = (value: unknown): value is LiveCell =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string' &&
  typeof Reflect.get(value, 'kind') === 'string' &&
  Array.isArray(Reflect.get(value, 'surfaces')) &&
  typeof Reflect.get(value, 'contract') === 'object';

const declaredSourceCellIds = async (): Promise<readonly string[]> => {
  const files = [
    ...cellFilesUnder(path.join(repositoryRoot, 'systems')),
    ...cellFilesUnder(path.join(repositoryRoot, 'experiences')),
  ].sort();
  const declarations: Readonly<{ file: string; id: string }>[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(file).href)) as Readonly<
      Record<string, unknown>
    >;
    const local = Object.entries(module).filter(
      ([name, value]) =>
        name.endsWith('CellDeclaration') && isCellDeclaration(value),
    );
    expect(local, path.relative(repositoryRoot, file)).toHaveLength(1);
    const declaration = local[0]?.[1];
    if (isCellDeclaration(declaration))
      declarations.push({ file, id: declaration.id });
  }
  const ids = declarations.map(({ id }) => id);
  expect(new Set(ids).size, 'source declaration operation IDs').toBe(
    ids.length,
  );
  return Object.freeze(ids.sort());
};

const selectedCellIds = (): readonly string[] => {
  const compilation = compileTopology(presslyTopology);
  expect(compilation.kind).toBe('compiled');
  if (compilation.kind === 'invalid') return [];
  return Object.freeze(
    compilation.topology.cells.map(({ manifest }) => manifest.id).sort(),
  );
};

const apiOwners = (): readonly LiveOwner[] => {
  const owners = makeApiTargetOwners({
    db: {} as ApiTargetOwnerCompositionDependencies['db'],
    clock: { now: () => new Date('2026-08-23T16:00:00.000Z') },
    ids: { next: () => '99000000-0000-4000-8000-000000000001' },
    access: {
      tokenSecret: 'live-cell-selection-token-secret',
      sessionTtlMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxFailures: 5,
      mfaChallengeTtlMinutes: 5,
      mfaChallengeMaxAttempts: 8,
      sessionIdleTimeoutMinutes: 30,
      mfaEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
      mfaIssuer: 'Pressly Live Cell Selection',
      policies: {
        pricing: { freshSessionMaxAgeMinutes: 15 },
        authSessions: { freshSessionMaxAgeMinutes: 15 },
        mfa: { freshSessionMaxAgeMinutes: 15 },
      },
    },
    control: {
      origin: 'https://control.pressly.test',
      presentation: {
        deriveCsrfToken: () => 'control-csrf-token',
        serializeCookies: () => [],
      },
    },
    processor: {
      origin: 'https://processor.pressly.test',
      presentation: {
        deriveCsrfToken: () => 'processor-csrf-token',
        serializeCookies: () => [],
      },
    },
  });
  return [
    ...Object.values(owners.systems),
    ...Object.values(owners.experiences),
  ] as readonly LiveOwner[];
};

const cliOwners = (): readonly LiveOwner[] => {
  let owners: PresslyCliRuntimeOwners | undefined;
  composePresslyCliRuntime(
    {
      selection: {
        catalog: {
          commandPrefixes: [],
          remoteCommandPrefixes: [],
          includeProgram: false,
          beforeStdinDatabaseOperationIds: [],
          contextBindings: [],
        },
        output: 'deferred',
        database: {
          environmentKey: 'DATABASE_URL',
          missingCode: 'database_url_missing',
          purpose: 'live cell selection',
          maxConnections: 1,
        },
        diagnostic: null,
      },
      apiUrl: undefined,
      fetch: globalThis.fetch,
      files: {
        read: async () => undefined,
        writePrivate: async () => undefined,
        clear: async () => undefined,
        readText: async () => '',
      },
      sessionPath: '/tmp/pressly-live-cell-selection-session.json',
      ensureDatabase: () =>
        ({}) as ReturnType<
          Parameters<typeof composePresslyCliRuntime>[0]['ensureDatabase']
        >,
      registerResource: () => undefined,
      clock: { now: () => new Date('2026-08-23T16:00:00.000Z') },
      ids: { next: () => '99000000-0000-4000-8000-000000000002' },
      configuration: { read: () => undefined },
    },
    (assembled) => {
      owners = assembled;
      return Object.freeze({
        cells: Object.freeze([]),
        entries: Object.freeze([]),
      });
    },
  );
  expect(owners).toBeDefined();
  return Object.values(owners ?? {}) as readonly LiveOwner[];
};

const assembledCellIds = (): readonly string[] => {
  const ids = [...apiOwners(), ...cliOwners()].flatMap((owner) =>
    Object.values(owner.cells).map(({ id }) => id),
  );
  return Object.freeze([...new Set(ids)].sort());
};

describe('live cell topology completeness', () => {
  it('selects every source-declared System and Experience cell exactly once', async () => {
    const declared = await declaredSourceCellIds();
    const selected = selectedCellIds();
    expect(declared).toHaveLength(193);
    expect(selected).toEqual(declared);
  }, 30_000);

  it('selects every cell produced by deployed owner assemblies', () => {
    const assembled = assembledCellIds();
    const selected = selectedCellIds();
    expect(assembled).toHaveLength(193);
    expect(selected).toEqual(assembled);
  });
});
