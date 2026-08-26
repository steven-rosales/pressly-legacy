import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

const sourceFiles = (root: string): readonly string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
  });

const contents = (root: string): string =>
  sourceFiles(root)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

describe('CLI runtime ownership', () => {
  it('keeps the generic host free of business-owner imports', () => {
    const host = contents(join(repositoryRoot, 'hosts/cli/src/runtime'));
    expect(host).not.toMatch(
      /@pressly\/(?:access|customers|ingress|orders|pricing|production)-system|@pressly\/experience-/,
    );
  });

  it('keeps process and filesystem effects out of topology', () => {
    const topology = contents(join(repositoryRoot, 'topology/runtime/cli'));
    expect(topology).not.toMatch(
      /\bprocess\.|\bNodeJS\.|from ['"]node:|\binput\.(?:stdin|stdout|stderr|environment|argv)\b/,
    );
  });

  it('keeps Control adapters and host filesystem effects in their owners', () => {
    for (const path of [
      'experiences/control/src/cli/adapters/api-client.ts',
      'experiences/control/src/cli/adapters/session-store.ts',
      'experiences/control/src/cli/bootstrap-production/runtime.ts',
      'hosts/cli/src/runtime/filesystem.ts',
      'hosts/cli/src/runtime/process-runtime.ts',
    ])
      expect(existsSync(join(repositoryRoot, path)), path).toBe(true);

    const controlAdapters = contents(
      join(repositoryRoot, 'experiences/control/src/cli'),
    );
    expect(controlAdapters).not.toMatch(/from ['"]node:/);
  });
});
