import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const scannedRoots = [
  'experiences',
  'hosts',
  'platform',
  'systems',
  'verification',
].map((directory) => join(repositoryRoot, directory));
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const sourceExtensions = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const ownerNames = [
  'access',
  'customers',
  'ingress',
  'orders',
  'pricing',
  'production',
] as const;
const ownerSchemaSpecifierPattern =
  /['"](@pressly\/(?:access|customers|ingress|orders|pricing|production)-system\/schema)['"]/g;

const listSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(entryPath);
      return sourceExtensions.has(extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return files.flat();
};

describe('PostgreSQL schema factory boundaries', () => {
  it('allows owner schema package imports only in topology composition', async () => {
    const sourceFiles = (
      await Promise.all(scannedRoots.map((root) => listSourceFiles(root)))
    ).flat();
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8');
      const specifiers = [...source.matchAll(ownerSchemaSpecifierPattern)].map(
        (match) => match[1],
      );
      if (specifiers.length > 0)
        violations.push(
          `${relative(repositoryRoot, file)}: ${specifiers.join(', ')}`,
        );
    }

    expect(violations).toEqual([]);

    const topologySource = await readFile(
      join(repositoryRoot, 'topology/pressly-postgres-schema.ts'),
      'utf8',
    );
    const topologySpecifiers = [
      ...topologySource.matchAll(ownerSchemaSpecifierPattern),
    ]
      .map((match) => match[1])
      .sort();
    expect(topologySpecifiers).toEqual(
      ownerNames.map((owner) => `@pressly/${owner}-system/schema`).sort(),
    );
  });

  it('keeps non-Access owner schema factories free of injected peer columns', async () => {
    const factoryFiles = [
      'systems/customers/src/schema/customers.ts',
      'systems/ingress/src/schema/ingress.ts',
      'systems/orders/src/schema/orders.ts',
      'systems/production/src/schema/production-schema.ts',
    ];

    for (const relativePath of factoryFiles) {
      const source = await readFile(join(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /AnyPgColumn|SchemaReferences|references[.][a-zA-Z]/u,
      );
    }

    const topologySource = await readFile(
      join(repositoryRoot, 'topology/pressly-postgres-schema.ts'),
      'utf8',
    );
    expect(topologySource).not.toMatch(
      /make(?:Customers|Ingress|Orders|Production)Schema\s*\(\s*\{/u,
    );
  });
});
