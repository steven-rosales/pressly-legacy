import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { runPresslyCli } from './app.ts';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: resolve(appDir, '.env.local'), quiet: true });

const main = async (): Promise<void> => {
  const exitCode = await runPresslyCli({
    argv: process.argv.slice(2),
    env: process.env,
    io: {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    },
  });

  process.exitCode = exitCode;
};

await main();
