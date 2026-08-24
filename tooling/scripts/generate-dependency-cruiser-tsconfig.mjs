import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolingError } from '../../platform/errors/src/tooling-error.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const outputPath = path.join(
  repositoryRoot,
  'tooling/typescript/dependency-cruiser.generated.json',
);
const checkOnly = process.argv.includes('--check');
const workspaceRoots = [
  'hosts',
  'systems',
  'experiences',
  'platform',
  'topology',
  'generated',
  'verification',
];
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'dist-runtime',
  'node_modules',
]);

const toRepositoryPath = (value) =>
  path.relative(repositoryRoot, value).split(path.sep).join('/');

const packageDirectories = [];
const collectPackageDirectories = (directory, depth = 0) => {
  if (depth > 3 || !existsSync(directory)) return;
  const manifestPath = path.join(directory, 'package.json');
  if (existsSync(manifestPath)) packageDirectories.push(directory);

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
    collectPackageDirectories(path.join(directory, entry.name), depth + 1);
  }
};

for (const root of workspaceRoots)
  collectPackageDirectories(path.join(repositoryRoot, root));

const manifestTarget = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  return value.import ?? value.default ?? value.types;
};

const sourceExtensions = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.json'];
const withoutCompiledExtension = (value) =>
  value
    .replace(/[.]d[.]mts$/u, '')
    .replace(/[.]d[.]ts$/u, '')
    .replace(/[.]m?js$/u, '');

const candidatePatterns = (target) => {
  const normalized = target.replace(/^\.\//u, '');
  const sourceRelative = normalized.startsWith('dist/')
    ? `src/${normalized.slice('dist/'.length)}`
    : normalized;
  const rootRelative = normalized.startsWith('dist/')
    ? normalized.slice('dist/'.length)
    : normalized;
  return [...new Set([sourceRelative, rootRelative])];
};

const existingSourceTarget = (packageDirectory, target) => {
  for (const candidate of candidatePatterns(target)) {
    const stem = withoutCompiledExtension(candidate);
    if (stem.includes('*')) {
      const prefix = stem.slice(0, stem.indexOf('*'));
      if (!existsSync(path.join(packageDirectory, path.dirname(prefix))))
        continue;
      return `${stem}.ts`;
    }

    for (const extension of sourceExtensions) {
      const source = `${stem}${extension}`;
      if (existsSync(path.join(packageDirectory, source))) return source;
    }
    for (const extension of sourceExtensions) {
      const source = path.join(stem, `index${extension}`);
      if (existsSync(path.join(packageDirectory, source))) return source;
    }
  }
  return undefined;
};

const paths = {
  '#customer/*': ['experiences/customer/src/web/*'],
  '@/*': ['hosts/browser/customer/src/*'],
  '@test/*': ['experiences/customer/test/web/*'],
};

for (const packageDirectory of packageDirectories.sort()) {
  const manifest = JSON.parse(
    readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  if (
    typeof manifest.name !== 'string' ||
    !manifest.name.startsWith('@pressly/')
  )
    continue;

  const exported = manifest.exports;
  if (
    typeof exported !== 'object' ||
    exported === null ||
    Array.isArray(exported)
  )
    continue;

  for (const [subpath, value] of Object.entries(exported)) {
    const target = manifestTarget(value);
    if (target === undefined) continue;
    const source = existingSourceTarget(packageDirectory, target);
    if (source === undefined)
      throw toolingError({
        code: 'dependency_cruiser_source_export_missing',
        message: `${manifest.name} ${subpath} has no source target for ${target}.`,
      });

    const key =
      subpath === '.'
        ? manifest.name
        : `${manifest.name}/${subpath.replace(/^\.\//u, '')}`;
    paths[key] = [toRepositoryPath(path.join(packageDirectory, source))];
  }
}

const orderedPaths = Object.fromEntries(
  Object.entries(paths).sort(([left], [right]) => left.localeCompare(right)),
);
const expected = `${JSON.stringify(
  {
    compilerOptions: {
      baseUrl: '../..',
      ignoreDeprecations: '6.0',
      paths: orderedPaths,
    },
    files: ['../../topology/pressly.topology.ts'],
  },
  null,
  2,
)}\n`;

if (checkOnly) {
  const current = existsSync(outputPath)
    ? readFileSync(outputPath, 'utf8')
    : '';
  if (current !== expected)
    throw toolingError({
      code: 'dependency_cruiser_tsconfig_stale',
      message:
        'Dependency Cruiser source resolution is stale. Run pnpm architecture:generate.',
    });
} else {
  writeFileSync(outputPath, expected);
  console.log(toRepositoryPath(outputPath));
}
