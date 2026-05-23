import { createElement } from 'react';
import { render } from 'ink';
import {
  normalizeUnknownError,
  type AppError,
  type Result,
} from '@pressly/errors';
import { PresslyAdminApp } from '../App.tsx';
import {
  parsePricingCliCommand,
  usage,
  type PricingCliCommand,
} from './args.ts';
import type { PricingAdminClient } from './client.ts';
import { commandError, toPricingChangeInput } from './command.ts';
import {
  makeLocalPricingAdminClient,
  type PricingCliEnv,
} from './local-client.ts';
import {
  renderAppError,
  renderPricingCatalog,
  renderPricingPlan,
  renderPricingPublishResult,
} from './render.ts';

type CliWriter = Readonly<{
  write: (chunk: string) => unknown;
}>;

export type PricingCliIO = Readonly<{
  stdin?: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream | CliWriter;
  stderr: NodeJS.WriteStream | CliWriter;
}>;

export type PricingCliDeps = Readonly<{
  makePricingAdminClient: (
    env: PricingCliEnv,
  ) => Result<PricingAdminClient, AppError>;
}>;

const defaultDeps: PricingCliDeps = {
  makePricingAdminClient: makeLocalPricingAdminClient,
};

const isTty = (stream: unknown): stream is NodeJS.WriteStream =>
  typeof stream === 'object' &&
  stream !== null &&
  'isTTY' in stream &&
  (stream as NodeJS.WriteStream).isTTY === true;

const writeOutput = (
  io: PricingCliIO,
  output: unknown,
  json: boolean,
): void => {
  io.stdout.write(
    json
      ? `${JSON.stringify(output, null, 2)}\n`
      : `${String(output).trimEnd()}\n`,
  );
};

const writeError = (io: PricingCliIO, error: AppError, json: boolean): void => {
  io.stderr.write(
    json
      ? `${JSON.stringify({ ok: false, error }, null, 2)}\n`
      : `${renderAppError(error)}\n`,
  );
};

const runPlainPricingCommand = async (
  command: PricingCliCommand,
  client: PricingAdminClient,
  io: PricingCliIO,
): Promise<number> => {
  if (command.action === 'show') {
    const result = await client.loadCatalog({
      serviceSlug: command.serviceSlug,
      ...(command.locationSlug === undefined
        ? {}
        : { locationSlug: command.locationSlug }),
    });

    if (!result.ok) {
      writeError(io, result.error, command.json);
      return 1;
    }

    writeOutput(
      io,
      command.json ? result.value : renderPricingCatalog(result.value),
      command.json,
    );
    return 0;
  }

  const input = toPricingChangeInput(command);

  if (!input.ok) {
    writeError(io, input.error, command.json);
    return 1;
  }

  if (command.action === 'plan') {
    const result = await client.planChange(input.value);

    if (!result.ok) {
      writeError(io, result.error, command.json);
      return 1;
    }

    writeOutput(
      io,
      command.json ? result.value : renderPricingPlan(result.value),
      command.json,
    );
    return 0;
  }

  if (!command.confirm) {
    writeError(
      io,
      commandError('pricing publish requires --yes to commit.'),
      command.json,
    );
    return 1;
  }

  const result = await client.publishChange(input.value);

  if (!result.ok) {
    writeError(io, result.error, command.json);
    return 1;
  }

  writeOutput(
    io,
    command.json ? result.value : renderPricingPublishResult(result.value),
    command.json,
  );

  return 0;
};

const runInkPricingCommand = async (
  command: PricingCliCommand,
  client: PricingAdminClient,
  io: PricingCliIO,
): Promise<number> => {
  const stdout = isTty(io.stdout) ? io.stdout : process.stdout;
  const stderr = isTty(io.stderr) ? io.stderr : process.stderr;
  const stdin = io.stdin ?? process.stdin;
  const instance = render(
    createElement(PresslyAdminApp, {
      command,
      client,
    }),
    {
      stdin,
      stdout,
      stderr,
    },
  );
  const exitValue = await instance.waitUntilExit();

  return typeof exitValue === 'number' ? exitValue : 0;
};

export const runPricingCli = async (
  argv: readonly string[],
  env: PricingCliEnv,
  io: PricingCliIO,
  deps: PricingCliDeps = defaultDeps,
): Promise<number> => {
  const parsed = parsePricingCliCommand(argv);

  if (!parsed.ok) {
    writeError(io, parsed.error, false);
    io.stderr.write(`\n${usage}\n`);
    return 1;
  }

  if (parsed.value === 'help') {
    io.stdout.write(`${usage}\n`);
    return 0;
  }

  const command = parsed.value;
  const client = deps.makePricingAdminClient(env);

  if (!client.ok) {
    writeError(io, client.error, command.json);
    return 1;
  }

  try {
    if (command.json || !isTty(io.stdout))
      return await runPlainPricingCommand(command, client.value, io);

    return await runInkPricingCommand(command, client.value, io);
  } catch (error) {
    writeError(io, normalizeUnknownError(error), command.json);
    return 1;
  } finally {
    await client.value.close();
  }
};
