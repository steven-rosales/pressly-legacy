#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import {
  apiUpArgs,
  detachedStackUpArgs,
  findNativeWslDockerMismatches,
} from './docker-stack.policy.mjs';

const command = process.argv[2];

const runDocker = (args) => {
  const result = spawnSync('docker', args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const runCompose = (args) => runDocker(['compose', ...args]);

const readDocker = (args) => {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error !== undefined) throw result.error;

  if (result.status !== 0) {
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    console.error('Docker is unavailable. Start Docker and try again.');
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
};

const isWsl = () => {
  if (process.platform !== 'linux') return false;
  if (process.env['WSL_DISTRO_NAME'] !== undefined) return true;

  try {
    return readFileSync('/proc/version', 'utf8')
      .toLowerCase()
      .includes('microsoft');
  } catch {
    return false;
  }
};

const assertExpectedDockerEngine = () => {
  const wsl = isWsl();
  const context = readDocker(['context', 'show']);
  const endpoint = readDocker([
    'context',
    'inspect',
    '--format',
    '{{.Endpoints.docker.Host}}',
    context,
  ]);
  const routingMismatches = findNativeWslDockerMismatches({
    isWsl: wsl,
    context,
    endpoint,
    hostname: hostname(),
    dockerHostOverride: process.env['DOCKER_HOST'],
    dockerContextOverride: process.env['DOCKER_CONTEXT'],
  });

  if (routingMismatches.length > 0) {
    failDockerSafetyCheck(routingMismatches);
  }

  const [daemonName = '', dockerRootDir = ''] = readDocker([
    'info',
    '--format',
    '{{.Name}}\t{{.DockerRootDir}}',
  ]).split('\t');
  const mismatches = findNativeWslDockerMismatches({
    isWsl: wsl,
    context,
    endpoint,
    daemonName,
    dockerRootDir,
    hostname: hostname(),
    dockerHostOverride: process.env['DOCKER_HOST'],
    dockerContextOverride: process.env['DOCKER_CONTEXT'],
  });

  if (mismatches.length > 0) failDockerSafetyCheck(mismatches);
};

function failDockerSafetyCheck(mismatches) {
  console.error('Pressly local Docker safety check failed:');
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  console.error(
    '\nUse the native WSL engine before running this command:\n' +
      '  sudo systemctl start docker\n' +
      '  docker context use default\n' +
      "  docker info --format '{{.Name}} {{.DockerRootDir}}'",
  );
  process.exit(1);
}

const startApi = () => {
  runCompose(apiUpArgs);
};

const buildWeb = () => {
  assertExpectedDockerEngine();
  startApi();
  runCompose(['build', 'web']);
};

const buildStack = () => {
  assertExpectedDockerEngine();
  startApi();
  runCompose(['build', 'web', 'worker', 'processor', 'control']);
};

const up = () => {
  buildStack();
  runCompose(detachedStackUpArgs);
  console.log(
    'Pressly is running in the background. Use "pnpm docker:logs" to follow logs.',
  );
};

switch (command) {
  case 'build-web':
    buildWeb();
    break;
  case 'up':
    up();
    break;
  default:
    console.error(
      'Usage: node tooling/scripts/docker-stack.mjs <up|build-web>',
    );
    process.exit(1);
}
