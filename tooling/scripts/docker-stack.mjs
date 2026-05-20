#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const command = process.argv[2];
const apiPort = process.env['API_PORT'] ?? '4000';
const apiReadyUrl = `http://localhost:${apiPort}/health/ready`;

const runDocker = (args) => {
  const result = spawnSync('docker', args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const runCompose = (args) => runDocker(['compose', ...args]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForApi = async () => {
  const startedAt = Date.now();
  const timeoutMs = 120_000;
  const intervalMs = 2_000;

  process.stdout.write(`Waiting for API readiness at ${apiReadyUrl}`);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(apiReadyUrl);

      if (response.ok) {
        process.stdout.write('\nAPI is ready.\n');
        return;
      }
    } catch {
      // The API container may still be booting, migrating, or seeding.
    }

    process.stdout.write('.');
    await sleep(intervalMs);
  }

  process.stdout.write('\n');
  console.error(
    `API did not become ready within ${timeoutMs / 1000}s. Check "pnpm docker:api:logs".`,
  );
  process.exit(1);
};

const buildWeb = async () => {
  runCompose(['up', '-d', '--build', 'postgres', 'api']);
  await waitForApi();
  runCompose(['build', 'web']);

  if (
    (process.env['PRESSLY_WEB_IMAGE'] ?? 'pressly-web:local') ===
    'pressly-web:local'
  ) {
    runDocker([
      'tag',
      'pressly-web:local',
      'ghcr.io/steven-rosales/pressly-web:local',
    ]);
  }
};

const up = async () => {
  await buildWeb();
  runCompose(['up', '--no-build', 'api', 'web']);
};

switch (command) {
  case 'build-web':
    await buildWeb();
    break;
  case 'up':
    await up();
    break;
  default:
    console.error(
      'Usage: node tooling/scripts/docker-stack.mjs <up|build-web>',
    );
    process.exit(1);
}
