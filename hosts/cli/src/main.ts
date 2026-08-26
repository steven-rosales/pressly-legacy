import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { presentAppError } from '@pressly/errors/presentation';
import {
  composeCliRuntime,
  createPresslyDatabase,
  resolveCliRuntimeInvocation,
} from '@pressly/topology/cli';
import { apiFailure } from '@pressly/http';
import { runCliRuntime } from './runtime/process-runtime.js';

const main = async (): Promise<number> => {
  const argv = process.argv.slice(2);
  const invocation = resolveCliRuntimeInvocation(argv);
  const io = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };

  try {
    const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    loadEnv({ path: resolve(appDir, '.env.local'), quiet: true });

    return await runCliRuntime(
      {
        invocation,
        environment: process.env,
        io,
        dependencies: { database: createPresslyDatabase },
      },
      composeCliRuntime,
    );
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    io.stderr.write(
      argv.includes('--json')
        ? `${JSON.stringify(apiFailure(normalized), null, 2)}\n`
        : `${presentAppError(normalized)}\n`,
    );
    return 1;
  }
};

process.exitCode = await main();
