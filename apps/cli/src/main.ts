import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { runPresslyCli } from './app.ts';
import { writeCliError } from './shell/errors.ts';

const main = async (): Promise<number> => {
  const argv = process.argv.slice(2);
  const io = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };

  try {
    const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    loadEnv({ path: resolve(appDir, '.env.local'), quiet: true });

    return await runPresslyCli({ argv, env: process.env, io });
  } catch (error) {
    writeCliError(io, normalizeUnknownError(error), argv.includes('--json'));
    return 1;
  }
};

process.exitCode = await main();
