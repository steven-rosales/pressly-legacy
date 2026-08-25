import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolingError } from '../../platform/errors/src/tooling-error.mjs';
import { duplicateOwnedPackageExportTargets } from './package-export-targets.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const includeOutputs = process.argv.includes('--include-outputs');

const sourceRoots = [
  'hosts',
  'systems',
  'experiences',
  'platform',
  'topology',
  'generated',
  'verification',
];
const currentRoots = [...sourceRoots, 'deploy', 'tooling', '.github'];
const forbiddenRoots = ['apps', 'infra', 'modules', 'packages'];
const forbiddenBuckets = new Set([
  'common',
  'compatibility',
  'legacy',
  'services',
  'shared',
  'utils',
]);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'dist-runtime',
  'node_modules',
]);
const outputDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'dist-runtime',
]);
const rootOutputDirectories = [
  '.artifacts',
  '.playwright-mcp',
  '.pnpm-store',
  '.turbo',
  '.vercel',
];
const allowedTopLevelDirectories = new Set([
  '.agents',
  '.git',
  '.github',
  '.vscode',
  'deploy',
  'docs',
  'experiences',
  'generated',
  'hosts',
  'node_modules',
  'platform',
  'stateworks',
  'systems',
  'tooling',
  'topology',
  'verification',
]);
const protectedPlans = new Map([
  [
    'docs/plan/refactoring-cell.md',
    '61e6c906ab3d0912aefa8123ae4363f86d18d5a365103beb0718a816531252ce',
  ],
  [
    'docs/plan/refactor-code-quality.md',
    '21a6db90d6a44a414e8e18c8205a545aff6f1b6946b25268707c8bbee8c8cfdd',
  ],
]);
const compilerOwnedGeneratedSources = new Set([
  'generated/architecture-map.ts',
  'generated/cli-catalog.ts',
  'generated/clients/control.ts',
  'generated/clients/customer.ts',
  'generated/clients/processor.ts',
  'generated/event-stream-catalog.ts',
  'generated/http-catalog.ts',
  'generated/job-catalog.ts',
  'generated/observability-catalog.ts',
  'generated/runtime/src/browser/control.ts',
  'generated/runtime/src/browser/customer-client.ts',
  'generated/runtime/src/browser/customer.ts',
  'generated/runtime/src/browser/processor.ts',
  'generated/runtime/src/cli.ts',
  'generated/runtime/src/http.ts',
  'generated/runtime/src/jobs.ts',
]);
const retiredPathPattern =
  /(?:^|[^A-Za-z0-9_])(?:apps|infra|modules|packages)\//u;
const retiredAppPackagePattern =
  /@pressly\/(?:api|cli|control|processor|web|worker)(?![A-Za-z0-9_-])/u;
const textFilePattern =
  /(?:Dockerfile|[.](?:docker|git|prettier)ignore|[.](?:cjs|css|html|js|json|jsx|md|mjs|sh|ts|tsx|txt|yaml|yml))$/u;
const outputFilePattern = /[.]tsbuildinfo$/u;

const relative = (value) =>
  path.relative(repositoryRoot, value).split(path.sep).join('/');

const readDirectory = (directory) =>
  existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];

const collectFiles = (directory, files = []) => {
  for (const entry of readDirectory(directory)) {
    if (ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(target, files);
    else if (entry.isFile()) files.push(target);
  }
  return files;
};

const collectForbiddenBuckets = (directory, violations) => {
  for (const entry of readDirectory(directory)) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (forbiddenBuckets.has(entry.name)) violations.push(relative(target));
    collectForbiddenBuckets(target, violations);
  }
};

const collectEmptyDirectories = (directory, violations) => {
  for (const entry of readDirectory(directory)) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (readDirectory(target).length === 0)
      violations.push(`empty source directory: ${relative(target)}`);
    else collectEmptyDirectories(target, violations);
  }
};

const collectOutputs = (directory, violations) => {
  for (const entry of readDirectory(directory)) {
    const target = path.join(directory, entry.name);
    if (entry.isFile() && outputFilePattern.test(entry.name)) {
      violations.push(relative(target));
      continue;
    }
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    if (outputDirectories.has(entry.name)) {
      violations.push(relative(target));
      continue;
    }
    collectOutputs(target, violations);
  }
};

const collectCompiledSiblings = (directory, violations) => {
  for (const file of collectFiles(directory)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const base = file.slice(0, -'.ts'.length);
    for (const extension of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
      const sibling = `${base}${extension}`;
      if (existsSync(sibling))
        violations.push(`compiled source sibling exists: ${relative(sibling)}`);
    }
  }
};

const currentDocumentationFiles = () => {
  const docsRoot = path.join(repositoryRoot, 'docs');
  return collectFiles(docsRoot).filter((file) => {
    const repositoryPath = relative(file);
    return (
      !repositoryPath.startsWith('docs/agents/') &&
      !repositoryPath.startsWith('docs/plan/') &&
      repositoryPath !== 'docs/architecture.md' &&
      repositoryPath !== 'docs/module-architecture.md'
    );
  });
};

const currentStateworksFiles = () =>
  [
    'stateworks/work/active/lpms-production-readiness/brief.md',
    'stateworks/work/active/lpms-production-readiness/network.yaml',
    'stateworks/work/active/pressly-control-workforce-identity/brief.md',
    'stateworks/work/active/pressly-control-workforce-identity/network.yaml',
    'stateworks/examples/security-hardening.network.yaml',
  ].map((file) => path.join(repositoryRoot, file));

const directWorkspaceLinks = () => {
  const links = [];
  const collectPresslyLinks = (presslyDirectory) => {
    for (const workspaceEntry of readDirectory(presslyDirectory)) {
      const target = path.join(presslyDirectory, workspaceEntry.name);
      if (lstatSync(target).isSymbolicLink()) links.push(target);
    }
  };
  const visit = (directory) => {
    for (const entry of readDirectory(directory)) {
      if (entry.name === 'node_modules') {
        collectPresslyLinks(path.join(directory, entry.name, '@pressly'));
        continue;
      }
      if (
        entry.isDirectory() &&
        !ignoredDirectories.has(entry.name) &&
        !entry.name.startsWith('.')
      )
        visit(path.join(directory, entry.name));
    }
  };
  for (const root of sourceRoots) visit(path.join(repositoryRoot, root));
  collectPresslyLinks(path.join(repositoryRoot, 'node_modules', '@pressly'));
  collectPresslyLinks(
    path.join(
      repositoryRoot,
      'node_modules',
      '.pnpm',
      'node_modules',
      '@pressly',
    ),
  );
  return links;
};

const brokenInstalledLinks = () => {
  const links = [];
  for (const directory of [
    path.join(repositoryRoot, 'node_modules'),
    path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'),
  ])
    for (const entry of readDirectory(directory))
      if (entry.isSymbolicLink()) {
        const target = path.join(directory, entry.name);
        try {
          realpathSync(target);
        } catch {
          links.push(target);
        }
      }
  return links;
};

const audit = () => {
  const violations = [];

  for (const root of forbiddenRoots)
    if (existsSync(path.join(repositoryRoot, root)))
      violations.push(`forbidden root exists: ${root}`);

  for (const entry of readDirectory(repositoryRoot)) {
    if (!entry.isDirectory()) continue;
    if (rootOutputDirectories.includes(entry.name)) continue;
    if (!allowedTopLevelDirectories.has(entry.name))
      violations.push(`unexpected top-level directory: ${entry.name}`);
  }

  for (const root of sourceRoots)
    collectForbiddenBuckets(path.join(repositoryRoot, root), violations);
  for (const root of currentRoots)
    collectEmptyDirectories(path.join(repositoryRoot, root), violations);

  for (const file of collectFiles(path.join(repositoryRoot, 'generated'))) {
    const repositoryPath = relative(file);
    if (
      /[.](?:[cm]?ts|tsx)$/.test(repositoryPath) &&
      !compilerOwnedGeneratedSources.has(repositoryPath)
    )
      violations.push(
        `handwritten source in generated tree: ${repositoryPath}`,
      );
  }

  const workspace = readFileSync(
    path.join(repositoryRoot, 'pnpm-workspace.yaml'),
    'utf8',
  );
  const lockfile = readFileSync(
    path.join(repositoryRoot, 'pnpm-lock.yaml'),
    'utf8',
  );
  for (const root of forbiddenRoots) {
    if (workspace.includes(`'${root}/`) || workspace.includes(`"${root}/`))
      violations.push(`workspace includes retired root: ${root}`);
    if (new RegExp(`^  ${root}/`, 'mu').test(lockfile))
      violations.push(`lockfile includes retired importer: ${root}`);
  }

  const generatedManifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'generated/package.json'), 'utf8'),
  );
  const generatedClientExports = Object.keys(generatedManifest.exports ?? {})
    .filter((specifier) => specifier.startsWith('./clients/'))
    .sort();
  const expectedGeneratedClientExports = [
    './clients/control',
    './clients/customer',
    './clients/processor',
  ];
  if (
    JSON.stringify(generatedClientExports) !==
    JSON.stringify(expectedGeneratedClientExports)
  )
    violations.push(
      'generated client exports must explicitly name control, customer, and processor',
    );

  const packageManifests = [
    path.join(repositoryRoot, 'package.json'),
    ...sourceRoots.flatMap((root) =>
      collectFiles(path.join(repositoryRoot, root)).filter(
        (file) => path.basename(file) === 'package.json',
      ),
    ),
  ];
  for (const manifestPath of packageManifests) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const duplicate of duplicateOwnedPackageExportTargets(manifest))
      violations.push(
        `duplicate package export target: ${relative(manifestPath)} ${duplicate.specifiers.join(', ')} -> ${duplicate.targetTuple}`,
      );
  }

  const currentFiles = [
    ...currentRoots.flatMap((root) =>
      collectFiles(path.join(repositoryRoot, root)),
    ),
    ...currentDocumentationFiles(),
    ...currentStateworksFiles(),
    ...[
      'package.json',
      'README.md',
      '.dockerignore',
      '.gitignore',
      '.prettierignore',
      'pnpm-workspace.yaml',
      'prettier.config.mjs',
      'skills-lock.json',
      'tsconfig.json',
      'turbo.json',
      'dependency-cruiser.config.mjs',
      'eslint.config.mjs',
      'docker-compose.yml',
    ].map((file) => path.join(repositoryRoot, file)),
  ].filter((file) => textFilePattern.test(file));
  for (const file of currentFiles) {
    const repositoryPath = relative(file);
    const source = readFileSync(file, 'utf8');
    if (retiredPathPattern.test(source))
      violations.push(`retired path reference: ${repositoryPath}`);
    if (retiredAppPackagePattern.test(source))
      violations.push(`retired app package reference: ${repositoryPath}`);
  }

  for (const [file, expectedHash] of protectedPlans) {
    const actualHash = createHash('sha256')
      .update(readFileSync(path.join(repositoryRoot, file)))
      .digest('hex');
    if (actualHash !== expectedHash)
      violations.push(`protected plan changed: ${file}`);
  }

  for (const link of directWorkspaceLinks()) {
    const repositoryPath = relative(link);
    const literalTarget = readlinkSync(link);
    let resolvedTarget;
    try {
      resolvedTarget = realpathSync(link);
    } catch (cause) {
      throw toolingError({
        code: 'broken_workspace_link',
        message: `Workspace link ${repositoryPath} is broken (${literalTarget}).`,
        cause,
      });
    }
    if (
      forbiddenRoots.some((root) =>
        resolvedTarget.includes(`${path.sep}${root}${path.sep}`),
      )
    )
      violations.push(`retired workspace link: ${repositoryPath}`);
    const linkedManifestPath = path.join(resolvedTarget, 'package.json');
    if (existsSync(linkedManifestPath)) {
      const linkedManifest = JSON.parse(
        readFileSync(linkedManifestPath, 'utf8'),
      );
      const expectedName = `@pressly/${path.basename(link)}`;
      if (linkedManifest.name !== expectedName)
        violations.push(
          `workspace link name mismatch: ${repositoryPath} resolves to ${String(linkedManifest.name)}`,
        );
    }
  }

  if (includeOutputs) {
    for (const directory of rootOutputDirectories)
      if (existsSync(path.join(repositoryRoot, directory)))
        violations.push(`root output exists: ${directory}`);
    for (const root of sourceRoots)
      collectOutputs(path.join(repositoryRoot, root), violations);
    for (const root of currentRoots)
      collectCompiledSiblings(path.join(repositoryRoot, root), violations);
    for (const link of brokenInstalledLinks())
      violations.push(`broken installed link: ${relative(link)}`);
  }

  return Object.freeze([...new Set(violations)].sort());
};

try {
  const violations = audit();
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      includeOutputs
        ? 'Final architecture and output residue audit passed.'
        : 'Final architecture source residue audit passed.',
    );
} catch (cause) {
  const failure =
    cause !== null &&
    typeof cause === 'object' &&
    'tag' in cause &&
    cause.tag === 'ToolingError'
      ? cause
      : toolingError({
          code: 'final_residue_audit_failed',
          message: 'Final architecture residue audit could not complete.',
          cause,
        });
  console.error(`${failure.code}: ${failure.message}`);
  process.exitCode = 1;
}
