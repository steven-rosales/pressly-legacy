import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { pricingCli } from './pricing/cli.ts';
import { runCli } from './shell/run-cli.ts';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: resolve(appDir, '.env.local'), quiet: true });

const main = async (): Promise<void> => {
  const exitCode = await runCli({
    argv: process.argv.slice(2),
    env: process.env,
    io: {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    },
    features: [pricingCli],
  });

  process.exitCode = exitCode;
};

await main();
