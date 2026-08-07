import { result } from '@pressly/kernel';
import { makeAppError } from '@pressly/errors/app-error';
import { createElement } from 'react';
import { Text } from 'ink';
import { describe, expect, it, vi } from 'vitest';

import { makeCliFeature } from '../../src/shell/feature.ts';
import { runCli } from '../../src/shell/run-cli.ts';
import { makeTestIo } from '../support/io.ts';

const testFeature = makeCliFeature({
  namespace: 'example',
  usage: 'example usage',
  parse: () => result.ok({ json: false }),
  makeClient: () => result.ok({ close: async () => undefined }),
  run: async () => result.ok('worked'),
  present: (output) => output,
  createView: () => createElement(Text, null, 'worked'),
});

describe('runCli', () => {
  it('prints global usage without constructing a feature client', async () => {
    const io = makeTestIo();
    const exitCode = await runCli({
      argv: ['--help'],
      env: {},
      io,
      features: [testFeature],
    });

    expect(exitCode).toBe(0);
    expect(io.stdout.text()).toMatch(/example usage/);
  });

  it('fails unknown namespaces before running a feature', async () => {
    const io = makeTestIo();
    const exitCode = await runCli({
      argv: ['missing'],
      env: {},
      io,
      features: [testFeature],
    });

    expect(exitCode).toBe(1);
    expect(io.stderr.text()).toMatch(/Unknown command namespace: missing/);
  });

  it('contains parser and client-construction exceptions in one boundary', async () => {
    const parserIo = makeTestIo();
    const makeClient = vi.fn(() => result.ok({ close: async () => undefined }));
    const parserFeature = makeCliFeature({
      ...testFeature,
      parse: () => {
        throw new Error('private parser failure');
      },
      makeClient,
    });

    const parserExit = await runCli({
      argv: ['example'],
      env: {},
      io: parserIo,
      features: [parserFeature],
    });

    expect(parserExit).toBe(1);
    expect(makeClient).not.toHaveBeenCalled();
    expect(parserIo.stderr.text()).toBe('An unexpected error occurred.\n');
    expect(parserIo.stderr.text()).not.toContain('private parser failure');

    const clientIo = makeTestIo();
    const clientFeature = makeCliFeature({
      ...testFeature,
      makeClient: () => {
        throw new Error('private client-construction failure');
      },
    });
    const clientExit = await runCli({
      argv: ['example'],
      env: {},
      io: clientIo,
      features: [clientFeature],
    });

    expect(clientExit).toBe(1);
    expect(clientIo.stderr.text()).toBe('An unexpected error occurred.\n');
    expect(clientIo.stderr.text()).not.toContain(
      'private client-construction failure',
    );
  });

  it('preserves the command failure when cleanup also fails', async () => {
    const io = makeTestIo();
    const close = vi.fn(async () => {
      throw new Error('private cleanup failure');
    });
    const primary = makeAppError({
      kind: 'ExternalServiceError',
      code: 'command_failed',
      message: 'Private command failure.',
      safeMessage: 'The command could not be completed.',
      status: 502,
    });
    const feature = makeCliFeature({
      ...testFeature,
      makeClient: () => result.ok({ close }),
      run: async () => result.err(primary),
    });

    const exitCode = await runCli({
      argv: ['example'],
      env: {},
      io,
      features: [feature],
    });

    expect(exitCode).toBe(1);
    expect(close).toHaveBeenCalledOnce();
    expect(io.stderr.text()).toBe('The command could not be completed.\n');
    expect(io.stderr.text()).not.toContain('Private command failure');
    expect(io.stderr.text()).not.toContain('private cleanup failure');
  });

  it('turns a cleanup-only failure into a safe nonzero result', async () => {
    const io = makeTestIo();
    const cleanup = makeAppError({
      kind: 'UnexpectedError',
      code: 'client_close_failed',
      message: 'Private client close failure.',
      safeMessage: 'The CLI could not finish cleanly.',
      status: 500,
    });
    const feature = makeCliFeature({
      ...testFeature,
      makeClient: () =>
        result.ok({
          close: async () => {
            throw cleanup;
          },
        }),
    });

    const exitCode = await runCli({
      argv: ['example'],
      env: {},
      io,
      features: [feature],
    });

    expect(exitCode).toBe(1);
    expect(io.stdout.text()).toBe('worked\n');
    expect(io.stderr.text()).toBe('The CLI could not finish cleanly.\n');
    expect(io.stderr.text()).not.toContain('Private client close failure');
  });
});
