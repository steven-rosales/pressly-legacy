import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const workspaceRootNames = Object.freeze([
  'hosts',
  'systems',
  'experiences',
  'platform',
  'topology',
  'verification',
] as const);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'dist-runtime',
  'node_modules',
]);

const normalize = (value: string): string => value.split(path.sep).join('/');
const relative = (value: string): string =>
  normalize(path.relative(repositoryRoot, value));

const collectFiles = (
  directory: string,
  include: (file: string) => boolean,
): readonly string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(target, include));
    else if (entry.isFile() && include(target)) files.push(target);
  }
  return files;
};

const collectDirectories = (directory: string): readonly string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return [target, ...collectDirectories(target)];
  });
};

const isSourceFile = (file: string): boolean =>
  /\.(?:[cm]?[jt]sx?)$/.test(file) && !file.endsWith('.d.ts');
const isTestSource = (file: string): boolean =>
  /(?:^|\/)(?:__tests__|test|tests|testing)(?:\/|$)/.test(normalize(file)) ||
  /\.(?:spec|test)\.(?:[cm]?[jt]sx?)$/.test(file);
const isConfigurationSource = (file: string): boolean =>
  /(?:^|\/)(?:drizzle|eslint|vite|vitest)(?:\.[^/]*)?\.config\.[^/]+$/.test(
    normalize(file),
  );

const sourceFiles = workspaceRootNames.flatMap((root) =>
  collectFiles(path.join(repositoryRoot, root), isSourceFile),
);

describe('final cellular architecture', () => {
  it('keeps vendor and ingress vocabulary inside Ingress adapters and cells', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const fileRelative = relative(file);
      if (isTestSource(file) || isConfigurationSource(file)) continue;
      const source = readFileSync(file, 'utf8');
      if (
        fileRelative.startsWith('systems/production/src/') &&
        /\b(?:cents|webhooks?|crm)\b|(?:crm_|webhook_(?:receipt|lease))/iu.test(
          source,
        )
      )
        violations.push(fileRelative);
      if (
        /^(?:systems\/customers|systems\/orders)\/src\//.test(fileRelative) &&
        /\bcents\b/iu.test(source)
      )
        violations.push(fileRelative);
    }
    expect(violations).toEqual([]);
  });

  it('keeps retired authorities absent from the final architecture', () => {
    const retiredDirectories = [
      'apps',
      'infra',
      'modules',
      'packages',
      'tooling/architecture',
    ];
    const violations = retiredDirectories.filter((directory) =>
      existsSync(path.join(repositoryRoot, directory)),
    );
    const rootManifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
    ) as Readonly<{
      scripts?: Readonly<Record<string, string>>;
    }>;
    for (const [name, command] of Object.entries(rootManifest.scripts ?? {}))
      if (
        name.includes('architecture:legacy') ||
        name.includes('typecheck:architecture') ||
        command.includes('tooling/architecture')
      )
        violations.push(`package.json#scripts.${name}`);
    expect(violations).toEqual([]);
  });

  it('keeps generic and compatibility buckets out of the final source tree', () => {
    const forbiddenBuckets = new Set([
      'common',
      'compatibility',
      'legacy',
      'services',
      'shared',
      'utils',
    ]);
    const violations = workspaceRootNames.flatMap((root) =>
      collectDirectories(path.join(repositoryRoot, root))
        .filter((directory) => forbiddenBuckets.has(path.basename(directory)))
        .map(relative),
    );
    expect(violations).toEqual([]);
  });
});
