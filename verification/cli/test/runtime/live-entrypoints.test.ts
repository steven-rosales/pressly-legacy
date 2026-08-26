import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authCliUsage,
  pricingCliUsage,
} from '@pressly/experience-control/cli/presentation';
import { makeCliCatalogFromOwners } from '@pressly/topology/cli';
import { describe, expect, it } from 'vitest';
import { runCliRuntime } from '../../../../hosts/cli/src/runtime/process-runtime.ts';
import { composePresslyCliRuntime } from '../../../../topology/runtime/cli/composition.ts';
import { resolvePresslyCliRuntimeInvocation } from '@pressly/topology/runtime/cli';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const cliRoot = resolve(repositoryRoot, 'hosts/cli');
const tsx = resolve(repositoryRoot, 'node_modules/.bin/tsx');
const globalUsage = `${authCliUsage}\n\n${pricingCliUsage}\n`;

const captureIo = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: { write: (chunk: string) => void stdout.push(chunk) },
      stderr: { write: (chunk: string) => void stderr.push(chunk) },
    },
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
  };
};

const execute = (file: string, argv: readonly string[]) => {
  const completed = spawnSync(tsx, [resolve(cliRoot, file), ...argv], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    status: completed.status,
    stdout: completed.stdout,
    stderr: completed.stderr,
  };
};

describe('live CLI entrypoints', () => {
  it('routes the app API and pressly-admin process through topology-selected help bytes', async () => {
    const output = captureIo();
    await expect(
      runCliRuntime(
        {
          invocation: resolvePresslyCliRuntimeInvocation([]),
          environment: {},
          io: output.io,
        },
        (assemblyInput) =>
          composePresslyCliRuntime(assemblyInput, makeCliCatalogFromOwners),
      ),
    ).resolves.toBe(0);
    expect(output.stdout()).toBe(globalUsage);
    expect(output.stderr()).toBe('');

    expect(execute('src/main.ts', ['--help'])).toEqual({
      status: 0,
      stdout: globalUsage,
      stderr: '',
    });
  });

  it('keeps bootstrap owner as a thin synthetic-argv boundary with no DB on invalid argv', () => {
    expect(
      execute('src/main.ts', ['bootstrap', 'owner', '--unexpected']),
    ).toEqual({
      status: 1,
      stdout: '',
      stderr:
        'Do not pass the owner password as an argument. Pipe it with --password-stdin.\n',
    });
  });

  it('keeps production bootstrap as a thin synthetic-argv boundary with no DB on invalid argv', () => {
    expect(
      execute('src/main.ts', ['bootstrap', 'production', '--unexpected']),
    ).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown production bootstrap argument: --unexpected.\n',
    });
  });
});
