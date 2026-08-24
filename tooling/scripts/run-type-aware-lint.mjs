import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslintExecutable = path.join(repositoryRoot, 'node_modules/.bin/eslint');
const configuration = path.join(
  repositoryRoot,
  'tooling/eslint/type-aware.config.mjs',
);

const workspaceDirectories = (group) => {
  const groupPath = path.join(repositoryRoot, group);
  return readdirSync(groupPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(group, entry.name))
    .filter((directory) =>
      existsSync(path.join(repositoryRoot, directory, 'src')),
    );
};

const targets = [
  ...workspaceDirectories('platform').map((directory) => [`${directory}/src`]),
  ...workspaceDirectories('systems').map((directory) => [`${directory}/src`]),
  ...workspaceDirectories('experiences').map((directory) => [
    `${directory}/src`,
  ]),
  ...workspaceDirectories('hosts').map((directory) => [`${directory}/src`]),
  ...workspaceDirectories('hosts/browser').map((directory) => [
    `${directory}/src`,
  ]),
  ['topology/src', 'topology/runtime', 'topology/tooling', 'topology/*.ts'],
  ['generated/*.ts'],
  ['generated/runtime/src'],
];

for (const lintTargets of targets) {
  const result = spawnSync(
    eslintExecutable,
    [
      '--config',
      configuration,
      ...lintTargets,
      '--no-error-on-unmatched-pattern',
      '--max-warnings=0',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
