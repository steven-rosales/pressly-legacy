import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { runPricingCli } from './pricing/cli.ts';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: resolve(appDir, '.env.local') });

const main = async (): Promise<void> => {
  const exitCode = await runPricingCli(process.argv.slice(2), process.env, {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });

  process.exitCode = exitCode;
};

await main();
