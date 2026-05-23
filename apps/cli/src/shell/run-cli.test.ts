import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { Text } from 'ink';
import { ok } from '@pressly/errors';
import { makeCliFeature } from './feature.ts';
import { runCli } from './run-cli.ts';
import type { CliIO } from './io.ts';

const makeWriter = () => {
  let value = '';

  return {
    write: (chunk: string | Uint8Array) => {
      value += chunk.toString();
      return true;
    },
    text: () => value,
  };
};

const makeIo = (): CliIO & {
  stdout: ReturnType<typeof makeWriter>;
  stderr: ReturnType<typeof makeWriter>;
} => ({
  stdout: makeWriter(),
  stderr: makeWriter(),
});

const testFeature = makeCliFeature({
  namespace: 'example',
  usage: 'example usage',
  parse: () => ok({ json: false }),
  makeClient: () => ok({ close: async () => undefined }),
  run: async () => ok('worked'),
  present: (output) => output,
  createView: () => createElement(Text, null, 'worked'),
});

describe('runCli', () => {
  it('prints global usage without constructing a feature client', async () => {
    const io = makeIo();
    const exitCode = await runCli({
      argv: ['--help'],
      env: {},
      io,
      features: [testFeature],
    });

    assert.equal(exitCode, 0);
    assert.match(io.stdout.text(), /example usage/);
  });

  it('fails unknown namespaces before running a feature', async () => {
    const io = makeIo();
    const exitCode = await runCli({
      argv: ['missing'],
      env: {},
      io,
      features: [testFeature],
    });

    assert.equal(exitCode, 1);
    assert.match(io.stderr.text(), /Unknown command namespace: missing/);
  });
});
