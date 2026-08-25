import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import ts from 'typescript';
import { toolingError } from '../../platform/errors/src/tooling-error.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
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
  'node_modules',
]);
const arguments_ = process.argv.slice(2);
const supportedArguments = new Set(['--check', '--write']);

const fail = (code, message, cause) => {
  throw toolingError({ code, message, cause });
};

if (arguments_.some((argument) => !supportedArguments.has(argument)))
  fail(
    'typescript_project_references_argument_invalid',
    `Unsupported argument. Use --check or --write. Received: ${arguments_.join(' ')}`,
  );

if (arguments_.includes('--check') && arguments_.includes('--write'))
  fail(
    'typescript_project_references_mode_ambiguous',
    'Choose either --check or --write, not both.',
  );

const write = arguments_.includes('--write');

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const toRepositoryPath = (value) =>
  path.relative(repositoryRoot, value).split(path.sep).join('/');
const toReferencePath = (fromConfig, toConfig) => {
  const relative = path
    .relative(path.dirname(fromConfig), toConfig)
    .split(path.sep)
    .join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
};

const packageDirectories = [];
const collectPackageDirectories = (directory) => {
  if (!existsSync(directory)) return;
  const manifestPath = path.join(directory, 'package.json');
  if (existsSync(manifestPath)) packageDirectories.push(directory);

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => compareText(left.name, right.name),
  )) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
    collectPackageDirectories(path.join(directory, entry.name));
  }
};

for (const root of workspaceRoots)
  collectPackageDirectories(path.join(repositoryRoot, root));

const packages = packageDirectories
  .map((directory) => {
    const manifestPath = path.join(directory, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (cause) {
      fail(
        'typescript_project_references_manifest_invalid',
        `Cannot parse ${toRepositoryPath(manifestPath)}.`,
        cause,
      );
    }
    if (
      typeof manifest.name !== 'string' ||
      !manifest.name.startsWith('@pressly/')
    )
      return undefined;
    return Object.freeze({ directory, manifest, manifestPath });
  })
  .filter((entry) => entry !== undefined)
  .sort((left, right) => compareText(left.manifest.name, right.manifest.name));

const packagesByName = new Map();
for (const package_ of packages) {
  const name = package_.manifest.name;
  if (packagesByName.has(name))
    fail(
      'typescript_project_references_package_duplicate',
      `Workspace package name ${name} is declared more than once.`,
    );
  packagesByName.set(name, package_);
}

const configDiagnostic = (diagnostic) =>
  ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
const parseConfig = (configPath) => {
  const diagnostics = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
        diagnostics.push(diagnostic),
    },
  );
  if (parsed === undefined || diagnostics.length > 0)
    fail(
      'typescript_project_references_config_invalid',
      `${toRepositoryPath(configPath)} cannot be parsed: ${diagnostics
        .map(configDiagnostic)
        .join('; ')}`,
    );
  return parsed;
};

const rootConfigPaths = (package_) =>
  readdirSync(package_.directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^tsconfig(?:[.][^.]+)?[.]json$/u.test(entry.name),
    )
    .map((entry) => path.join(package_.directory, entry.name))
    .sort(compareText);

const referenceTargetsByPackage = new Map();
for (const package_ of packages) {
  const candidates = rootConfigPaths(package_).filter((configPath) => {
    const parsed = parseConfig(configPath);
    return parsed.options.composite === true && parsed.options.noEmit !== true;
  });
  if (candidates.length > 1)
    fail(
      'typescript_project_references_target_ambiguous',
      `${package_.manifest.name} has multiple emitting composite projects: ${candidates
        .map(toRepositoryPath)
        .join(', ')}`,
    );
  if (candidates.length === 1)
    referenceTargetsByPackage.set(package_.manifest.name, candidates[0]);
}

const dependencyNamesFor = (package_) => {
  const declared = {
    ...(package_.manifest.dependencies ?? {}),
    ...(package_.manifest.optionalDependencies ?? {}),
    ...(package_.manifest.devDependencies ?? {}),
    ...(package_.manifest.peerDependencies ?? {}),
  };
  return Object.entries(declared)
    .filter(
      ([name, version]) =>
        packagesByName.has(name) &&
        typeof version === 'string' &&
        version.startsWith('workspace:'),
    )
    .map(([name]) => name)
    .sort(compareText);
};

const dependencyGraph = new Map(
  packages.map((package_) => [
    package_.manifest.name,
    dependencyNamesFor(package_),
  ]),
);
const visiting = new Set();
const visited = new Set();
const stack = [];
const visit = (name) => {
  if (visiting.has(name)) {
    const cycleStart = stack.indexOf(name);
    fail(
      'typescript_project_references_cycle',
      `Workspace dependency cycle: ${[...stack.slice(cycleStart), name].join(
        ' -> ',
      )}`,
    );
  }
  if (visited.has(name)) return;
  visiting.add(name);
  stack.push(name);
  for (const dependency of dependencyGraph.get(name) ?? []) visit(dependency);
  stack.pop();
  visiting.delete(name);
  visited.add(name);
};
for (const name of [...dependencyGraph.keys()].sort(compareText)) visit(name);

for (const [name, dependencies] of dependencyGraph) {
  for (const dependency of dependencies) {
    if (!referenceTargetsByPackage.has(dependency))
      fail(
        'typescript_project_references_target_missing',
        `${name} depends on ${dependency}, but ${dependency} has no single emitting composite TypeScript project.`,
      );
  }
}

const packageDirectorySet = new Set(packages.map(({ directory }) => directory));
const collectOwnedConfigs = (package_, directory = package_.directory) => {
  const configs = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => compareText(left.name, right.name),
  )) {
    if (ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (target !== package_.directory && packageDirectorySet.has(target))
        continue;
      configs.push(...collectOwnedConfigs(package_, target));
      continue;
    }
    if (/^tsconfig(?:[.][^.]+)?[.]json$/u.test(entry.name))
      configs.push(target);
  }
  return configs;
};

const owningPackageForPath = (target) =>
  packages
    .filter(
      (package_) =>
        target === package_.directory ||
        target.startsWith(`${package_.directory}${path.sep}`),
    )
    .sort((left, right) => right.directory.length - left.directory.length)[0];

const resolveReference = (configPath, referencePath) => {
  const absolute = path.resolve(path.dirname(configPath), referencePath);
  if (path.extname(absolute) === '.json') return absolute;
  if (existsSync(absolute) && !existsSync(path.join(absolute, 'tsconfig.json')))
    return `${absolute}.json`;
  return path.join(absolute, 'tsconfig.json');
};

const rawConfig = (configPath) => {
  const source = readFileSync(configPath, 'utf8');
  const result = ts.parseConfigFileTextToJson(configPath, source);
  if (result.error !== undefined)
    fail(
      'typescript_project_references_config_invalid',
      `${toRepositoryPath(configPath)} cannot be parsed: ${configDiagnostic(
        result.error,
      )}`,
    );
  return result.config;
};

const staleConfigs = [];
let synchronizedCount = 0;
let referenceCount = 0;

for (const package_ of packages) {
  const workspaceReferenceTargets = dependencyNamesFor(package_).map((name) =>
    referenceTargetsByPackage.get(name),
  );

  for (const configPath of collectOwnedConfigs(package_).sort(compareText)) {
    const parsed = parseConfig(configPath);
    if (parsed.fileNames.length === 0) continue;

    const config = rawConfig(configPath);
    const currentReferences = Array.isArray(config.references)
      ? config.references
      : [];
    const preservedReferences = currentReferences.filter((reference) => {
      if (
        typeof reference !== 'object' ||
        reference === null ||
        typeof reference.path !== 'string'
      )
        fail(
          'typescript_project_references_entry_invalid',
          `${toRepositoryPath(configPath)} has a reference without a string path.`,
        );
      const owner = owningPackageForPath(
        resolveReference(configPath, reference.path),
      );
      return owner === undefined || owner.directory === package_.directory;
    });
    const expectedReferences = [
      ...preservedReferences,
      ...workspaceReferenceTargets.map((target) => ({
        path: toReferencePath(configPath, target),
      })),
    ]
      .sort((left, right) => compareText(left.path, right.path))
      .filter(
        (reference, index, references) =>
          index === 0 || reference.path !== references[index - 1].path,
      );
    const currentPaths = currentReferences.map((reference) => reference.path);
    const expectedPaths = expectedReferences.map((reference) => reference.path);
    if (JSON.stringify(currentPaths) === JSON.stringify(expectedPaths)) {
      referenceCount += expectedReferences.length;
      continue;
    }

    staleConfigs.push(configPath);
    if (!write) continue;
    if (expectedReferences.length === 0) delete config.references;
    else config.references = expectedReferences;
    const formatted = await format(JSON.stringify(config, null, 2), {
      filepath: configPath,
      parser: 'json',
    });
    writeFileSync(configPath, formatted, 'utf8');
    synchronizedCount += 1;
    referenceCount += expectedReferences.length;
  }
}

if (!write && staleConfigs.length > 0)
  fail(
    'typescript_project_references_stale',
    `TypeScript project references are stale in ${staleConfigs.length} config(s): ${staleConfigs
      .map(toRepositoryPath)
      .join(', ')}. Run pnpm typescript:references:write.`,
  );

console.log(
  write
    ? `Synchronized ${synchronizedCount} TypeScript config(s) with ${referenceCount} project reference(s).`
    : `TypeScript project references are current across ${packages.length} workspace package(s).`,
);
