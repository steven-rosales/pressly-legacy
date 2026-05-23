#!/usr/bin/env node

import { spawn } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const useDocker = rawArgs[0] === '--docker';
const cliArgs = useDocker ? rawArgs.slice(1) : rawArgs;

const statusFor = (args) => {
  if (args.includes('--help') || args.length === 0)
    return 'Loading admin CLI...';

  const [namespace, action] = args;

  if (namespace === 'pricing' && action === 'show')
    return 'Showing pricing catalog...';

  if (namespace === 'pricing' && action === 'plan')
    return 'Planning pricing change...';

  if (namespace === 'pricing' && action === 'publish')
    return 'Publishing pricing change...';

  return 'Running admin command...';
};

const runCaptured = (command, args, label) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));

    child.on('close', (code) => {
      if (code !== 0) {
        process.stderr.write(`${label} failed.\n\n`);
        for (const chunk of chunks) process.stderr.write(chunk);
      }

      resolve(code ?? 1);
    });

    child.on('error', (error) => {
      process.stderr.write(`${label} failed.\n\n${error.message}\n`);
      resolve(1);
    });
  });

const runInherited = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      resolve(1);
    });
  });

const runLocal = async () => {
  process.stderr.write(`${statusFor(cliArgs)}\n`);

  const buildCode = await runCaptured(
    'pnpm',
    ['--silent', '-F', '@pressly/cli', 'run', 'build:workspace-deps'],
    'Admin CLI build',
  );

  if (buildCode !== 0) return buildCode;

  return runInherited('pnpm', [
    '--silent',
    '-F',
    '@pressly/cli',
    'exec',
    'tsx',
    'src/main.ts',
    '--',
    ...cliArgs,
  ]);
};

const containerCommand = `
set -eu

install_log="/tmp/pressly-admin-install.log"
build_log="/tmp/pressly-admin-build.log"

if ! pnpm install --frozen-lockfile --silent >"$install_log" 2>&1; then
  echo "Admin CLI install failed." >&2
  echo >&2
  cat "$install_log" >&2
  exit 1
fi

if ! pnpm --silent -F @pressly/cli run build:workspace-deps >"$build_log" 2>&1; then
  echo "Admin CLI build failed." >&2
  echo >&2
  cat "$build_log" >&2
  exit 1
fi

pnpm --silent -F @pressly/cli exec tsx src/main.ts -- "$@"
`;

const runDocker = async () => {
  process.stderr.write(`${statusFor(cliArgs)}\n`);

  return runInherited('docker', [
    'compose',
    '--progress',
    'quiet',
    'run',
    '--rm',
    '-T',
    '-e',
    'PRESSLY_ADMIN_DATABASE_URL=postgres://pressly:pressly@postgres:5432/pressly',
    'api',
    'sh',
    '-lc',
    containerCommand,
    '--',
    ...cliArgs,
  ]);
};

process.exitCode = useDocker ? await runDocker() : await runLocal();
