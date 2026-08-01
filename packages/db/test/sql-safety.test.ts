import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { sql } from '../src/query.ts';
import { truncateTestTables } from '../src/testing.ts';

const dbRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(dbRoot, '../..');
const sourceRoots = ['apps', 'modules', 'packages'].map((directory) =>
  join(repositoryRoot, directory),
);
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const repositoryScanTimeoutMs = 15_000;

const listSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];

      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) return listSourceFiles(entryPath);
      if (!sourceExtensions.has(extname(entry.name))) return [];

      return [entryPath];
    }),
  );

  return files.flat();
};

let sourceFilesPromise: Promise<string[]> | undefined;

const loadSourceFiles = (): Promise<string[]> => {
  sourceFilesPromise ??= Promise.all(
    sourceRoots.map((root) => listSourceFiles(root)),
  ).then((files) => files.flat());

  return sourceFilesPromise;
};

describe('SQL safety boundaries', () => {
  it('exposes parameterized SQL without raw construction helpers', () => {
    expect(sql).toBeTypeOf('function');
    expect('raw' in sql).toBe(false);
    expect('identifier' in sql).toBe(false);
  });

  it(
    'keeps direct Drizzle imports inside the database package',
    async () => {
      const violations: string[] = [];
      const files = await loadSourceFiles();
      const drizzleImportPattern =
        /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)['"]drizzle-orm(?:\/[^'"]*)?['"]/;

      for (const file of files) {
        const repositoryPath = relative(repositoryRoot, file);
        if (repositoryPath.startsWith('packages/db/src/')) continue;

        const contents = await readFile(file, 'utf8');
        if (drizzleImportPattern.test(contents))
          violations.push(repositoryPath);
      }

      expect(violations).toEqual([]);
    },
    repositoryScanTimeoutMs,
  );

  it(
    'does not use raw SQL construction',
    async () => {
      const violations: string[] = [];
      const files = await loadSourceFiles();

      for (const file of files) {
        const contents = await readFile(file, 'utf8');
        if (/\bsql\.raw\s*\(/.test(contents))
          violations.push(relative(repositoryRoot, file));
      }

      expect(violations).toEqual([]);
    },
    repositoryScanTimeoutMs,
  );

  it('rejects unsafe test table identifiers before executing SQL', async () => {
    const execute = vi.fn();

    await expect(
      truncateTestTables({ execute } as never, [
        'auth_sessions; drop table auth_identities',
      ]),
    ).rejects.toThrow('Unsafe test table name');
    expect(execute).not.toHaveBeenCalled();
  });
});
