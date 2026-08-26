import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslintExecutable = path.join(repositoryRoot, 'node_modules/.bin/eslint');
const configuration = path.join(
  repositoryRoot,
  'tooling/eslint/type-aware.config.mjs',
);

const sourceDirectories = (parent) =>
  readdirSync(path.join(repositoryRoot, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name, 'src'))
    .filter((directory) => existsSync(path.join(repositoryRoot, directory)));

const targets = [
  ...sourceDirectories('platform'),
  ...sourceDirectories('systems'),
  ...sourceDirectories('experiences'),
  ...sourceDirectories('hosts'),
  ...sourceDirectories('hosts/browser'),
  'topology/src',
  'topology/browser',
  'topology/runtime',
  'topology/tooling',
  'topology/*.ts',
];

for (const target of targets) {
  const result = spawnSync(
    eslintExecutable,
    [
      '--config',
      configuration,
      target,
      '--no-error-on-unmatched-pattern',
      '--max-warnings=0',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
