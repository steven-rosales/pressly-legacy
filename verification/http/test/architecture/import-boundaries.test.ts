import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const hostRoot = resolve(repositoryRoot, 'hosts/http');
const topologyRoot = resolve(repositoryRoot, 'topology/runtime/http');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(entry.name) ? [path] : [];
  });

describe('HTTP runtime ownership', () => {
  it('keeps the host free of business-owner imports', () => {
    const violations = sourceFiles(hostRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /@pressly\/(?:access|customers|ingress|orders|pricing|production)-system|@pressly\/experience-/u.test(
        source,
      )
        ? [relative(hostRoot, file)]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it('keeps process effects out of topology assembly', () => {
    const violations = sourceFiles(topologyRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /\bprocess\.(?:env|argv|exit|exitCode|hrtime|on)\b|@sentry\/|\bdotenv\b/u.test(
        source,
      )
        ? [relative(topologyRoot, file)]
        : [];
    });
    expect(violations).toEqual([]);
  });
});
