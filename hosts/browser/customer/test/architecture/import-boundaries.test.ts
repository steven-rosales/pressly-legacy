import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });

const importSpecifiers = (source: string): string[] => [
  ...[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  ),
  ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map(
    (match) => match[1] ?? '',
  ),
  ...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (match) => match[1] ?? '',
  ),
];

const targetFor = (file: string, specifier: string): string | null => {
  if (specifier.startsWith('@/'))
    return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
  return null;
};

const inZone = (candidate: string, zone: string): boolean =>
  candidate === zone || candidate.startsWith(`${zone}/`);

const isInside = (candidate: string, owner: string): boolean =>
  candidate === owner || candidate.startsWith(`${owner}/`);

const dependencyViolations = (files: readonly string[]): string[] =>
  files.flatMap((file) => {
    const sourceRelative = relative(sourceRoot, file).replaceAll('\\', '/');
    const isFeatureServer = /^(?:server|.+\.server)\.[jt]sx?$/.test(
      basename(file),
    );

    return importSpecifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
      const target = targetFor(file, specifier);
      if (target === null || !isInside(target, sourceRoot)) return [];
      const targetRelative = relative(sourceRoot, target).replaceAll('\\', '/');
      let reason: string | undefined;

      if (inZone(sourceRelative, 'common/core')) {
        if (
          inZone(targetRelative, 'app') ||
          inZone(targetRelative, 'features') ||
          inZone(targetRelative, 'common/adapters')
        )
          reason = 'core-to-outward';
      } else if (inZone(sourceRelative, 'common/adapters')) {
        if (inZone(targetRelative, 'app') || inZone(targetRelative, 'features'))
          reason = 'adapter-to-product';
      } else if (inZone(sourceRelative, 'common')) {
        if (inZone(targetRelative, 'app') || inZone(targetRelative, 'features'))
          reason = 'common-to-product';
      } else if (inZone(sourceRelative, 'features')) {
        if (inZone(targetRelative, 'app')) reason = 'feature-to-route';
        else if (!isFeatureServer && inZone(targetRelative, 'common/adapters'))
          reason = 'feature-to-concrete-adapter';
      } else if (inZone(sourceRelative, 'components/ui')) {
        const targetWithoutExtension = targetRelative.replace(/\.[jt]sx?$/, '');
        if (
          !inZone(targetWithoutExtension, 'components/ui') &&
          targetWithoutExtension !== 'styles/utils'
        )
          reason = 'ui-to-product';
      } else if (inZone(sourceRelative, 'config')) {
        if (
          inZone(targetRelative, 'app') ||
          inZone(targetRelative, 'features') ||
          inZone(targetRelative, 'common/adapters')
        )
          reason = 'config-to-runtime';
      }

      return reason === undefined
        ? []
        : [`${sourceRelative} -> ${specifier} (${reason})`];
    });
  });

const privateRouteViolations = (files: readonly string[]): string[] =>
  files.flatMap((file) =>
    importSpecifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
      const target = targetFor(file, specifier);
      if (target === null || !isInside(target, sourceRoot)) return [];
      const targetRelative = relative(sourceRoot, target).replaceAll('\\', '/');
      if (!inZone(targetRelative, 'app')) return [];

      const targetSegments = targetRelative.slice('app/'.length).split('/');
      const privateIndex = targetSegments.findIndex((segment) =>
        /^_(?:components|lib|shared)$/.test(segment),
      );
      if (privateIndex === -1) return [];

      const owner = resolve(
        sourceRoot,
        'app',
        ...targetSegments.slice(0, privateIndex),
      );
      return isInside(file, owner)
        ? []
        : [`${relative(sourceRoot, file)} -> ${specifier}`];
    }),
  );

describe('web import boundaries', () => {
  const files = sourceFiles(sourceRoot);

  it('keeps dependency direction across routes, features, core, adapters, and UI', () => {
    expect(dependencyViolations(files)).toEqual([]);
  });

  it('keeps route-private code inside its owning route subtree', () => {
    expect(privateRouteViolations(files)).toEqual([]);
  });

  it('has no unbounded app/shared or source common directory', () => {
    expect(
      files.some(
        (file) =>
          file.includes('/app/shared/') || file.includes('/src/common/'),
      ),
    ).toBe(false);
  });
});
