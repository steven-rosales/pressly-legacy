import { result } from '@pressly/kernel';
import { createElement } from 'react';
import { Text } from 'ink';
import { describe, expect, it } from 'vitest';

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
});
