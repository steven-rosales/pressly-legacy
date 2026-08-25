import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import type { CliInteractiveFrame } from '@pressly/cells';
import { describe, expect, it } from 'vitest';

const restoreEnvironment = (key: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const loadInteractiveInkTty = async () => {
  const previousCi = process.env['CI'];
  const previousContinuousIntegration = process.env['CONTINUOUS_INTEGRATION'];
  const previousForceColor = process.env['FORCE_COLOR'];
  try {
    // Ink snapshots CI mode at import time; this proof exercises its TTY path.
    process.env['CI'] = 'false';
    process.env['CONTINUOUS_INTEGRATION'] = 'false';
    process.env['FORCE_COLOR'] = '1';
    return await import('../../src/ink-tty.tsx');
  } finally {
    restoreEnvironment('CI', previousCi);
    restoreEnvironment('CONTINUOUS_INTEGRATION', previousContinuousIntegration);
    restoreEnvironment('FORCE_COLOR', previousForceColor);
  }
};

const { makeInkCliTty } = await loadInteractiveInkTty();

type PseudoTty = Readonly<{
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  input: PassThrough;
  output: () => string;
}>;

const pseudoTty = (): PseudoTty => {
  const input = new PassThrough();
  const output = new PassThrough();
  const errors = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  Object.assign(input, {
    isTTY: true,
    setRawMode: () => input,
    ref: () => input,
    unref: () => input,
  });
  Object.assign(output, { isTTY: true, columns: 100, rows: 30 });
  Object.assign(errors, { isTTY: true, columns: 100, rows: 30 });
  return {
    stdin: input as unknown as NodeJS.ReadStream,
    stdout: output as unknown as NodeJS.WriteStream,
    stderr: errors as unknown as NodeJS.WriteStream,
    input,
    output: () => Buffer.concat(chunks).toString('utf8'),
  };
};

const operation = {
  operationId: 'control.cli-pricing-publish.v1',
  observability: 'control.cli.pricing_publish',
  commandId: 'control.cli-pricing-publish-command.v1',
  commandName: ['pricing', 'publish'],
  authentication: 'none' as const,
  contextRequirements: [],
  capabilityRequirements: [],
};

const loading: CliInteractiveFrame = {
  lines: [{ text: 'Loading pricing...', tone: 'info' }],
};
const confirmation: CliInteractiveFrame = {
  lines: [
    { text: 'Pricing change plan' },
    { text: ' ' },
    {
      text: 'Publish this pricing change? Press y to publish or n to cancel.',
      tone: 'warning',
    },
  ],
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Pseudo-TTY output did not reach the expected frame.');
};

const runDecision = async (key: string) => {
  const terminal = pseudoTty();
  const tty = makeInkCliTty(terminal);
  const run = tty.run({
    operation,
    signal: new AbortController().signal,
    drive: async (session) => {
      await session.render(loading);
      await session.render(confirmation);
      const decision = await session.readKey({
        signal: new AbortController().signal,
      });
      if (decision.escape || decision.input.toLowerCase() === 'n') {
        await session.render({
          lines: [{ text: 'Pricing change cancelled.', tone: 'warning' }],
        });
        return 1;
      }
      await session.render({
        lines: [{ text: 'Publishing pricing change...', tone: 'info' }],
      });
      await session.render({ lines: [{ text: 'Pricing change published' }] });
      return 0;
    },
  });
  await waitFor(() =>
    terminal.output().includes('Publish this pricing change?'),
  );
  terminal.input.write(key);
  terminal.input.end();
  const code = await run;
  return { code, raw: terminal.output() };
};

describe('neutral Ink TTY adapter', () => {
  it('drives y through loading, confirmation, publishing, and ANSI frames', async () => {
    const output = await runDecision('y');
    const visible = stripVTControlCharacters(output.raw);

    expect(output.code).toBe(0);
    expect(output.raw).toContain('\u001B[');
    expect(output.raw).toContain('\u001B[36mLoading pricing...');
    expect(output.raw).toContain(
      '\u001B[33mPublish this pricing change? Press y to publish or n to cancel.',
    );
    expect(output.raw).not.toContain('\u001B[33mPricing change plan');
    expect(visible).toContain('Loading pricing...');
    expect(visible).toContain('Pricing change plan');
    expect(visible).toContain('Publishing pricing change...');
    expect(visible).toContain('Pricing change published');
  });

  it.each([
    ['n', 'n'],
    ['Escape', '\u001B'],
  ])('maps %s to cancellation without publishing', async (_name, key) => {
    const output = await runDecision(key);
    const visible = stripVTControlCharacters(output.raw);

    expect(output.code).toBe(1);
    expect(visible).toContain('Pricing change cancelled.');
    expect(visible).not.toContain('Publishing pricing change...');
  });
});
