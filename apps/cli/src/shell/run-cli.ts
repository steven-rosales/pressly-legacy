import { render } from 'ink';
import { result } from '@pressly/kernel';
import { normalizeUnknownError, validationError } from '@pressly/errors';
import type { AppError } from '@pressly/errors';
import type { CliCommand, CliFeature, CliClient } from './feature.ts';
import type { CliIO } from './io.ts';
import { isTty } from './io.ts';
import { writeCliError, writeCliOutput } from './errors.ts';

export type RunCliInput = Readonly<{
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  io: CliIO;
  features: readonly CliFeature[];
}>;

const normalizeArgv = (argv: readonly string[]): readonly string[] =>
  argv[0] === '--' ? argv.slice(1) : argv;

const buildUsage = (features: readonly CliFeature[]): string =>
  features.map((feature) => feature.usage).join('\n\n');

const namespaceError = (namespace: string | undefined): AppError =>
  validationError({
    code: 'invalid_cli_namespace',
    message:
      namespace === undefined
        ? 'Expected a command namespace.'
        : `Unknown command namespace: ${namespace}.`,
    safeMessage:
      namespace === undefined
        ? 'Expected a command namespace.'
        : `Unknown command namespace: ${namespace}.`,
    details: { namespace },
  });

/**
 * Finds the feature specified in the CLI
 * @param argv The arguments specified in the CLI
 * @param features The feature and all the commands it can run.
 * @returns `feature` and `namespace` (which is usually the name of the feature)
 */
const findFeature = (
  argv: readonly string[],
  features: readonly CliFeature[],
) => {
  const args = normalizeArgv(argv);
  const namespace = args[0];

  return {
    feature: features.find((candidate) => candidate.namespace === namespace),
    namespace,
  };
};

/**
 * This runs the http command
 */
const runPlainCommand = async (
  feature: CliFeature,
  command: CliCommand,
  client: CliClient,
  io: CliIO,
): Promise<number> => {
  const commandResult = await feature.run(command, client);

  if (result.isErr(commandResult)) {
    writeCliError(io, commandResult.error, command.json);
    return 1;
  }

  writeCliOutput(
    io,
    command.json
      ? feature.serialize(commandResult.value)
      : feature.present(commandResult.value),
    command.json,
  );

  return 0;
};

const runInteractiveCommand = async (
  feature: CliFeature,
  command: CliCommand,
  client: CliClient,
  io: CliIO,
): Promise<number> => {
  const stdout = isTty(io.stdout) ? io.stdout : process.stdout;
  const stderr = isTty(io.stderr) ? io.stderr : process.stderr;
  const stdin = io.stdin ?? process.stdin;
  const instance = render(feature.createView({ command, client }), {
    stdin,
    stdout,
    stderr,
  });
  const exitValue = await instance.waitUntilExit();

  return typeof exitValue === 'number' ? exitValue : 0;
};

/**
 * Runs the CLI for a command namespace such as `pricing`.
 *
 * Responsibilities:
 * - handles top level help
 * - resolves the matching feature
 * - parses the feature command
 * - creates and closes the feature client
 * - chooses plain output or interactive Ink rendering
 *
 * One of the most important properties in inputs is `input.features.createView` which is of type `({ command, client }) => createElement(<feature>CliView, { command, client })`. This is used to compose with `render` from ink in `runInteractiveCommand`.
 *
 * Returns the process exit code.
 */
export const runCli = async (input: RunCliInput): Promise<number> => {
  const args = normalizeArgv(input.argv);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    input.io.stdout.write(`${buildUsage(input.features)}\n`);
    return 0;
  }

  const { feature, namespace } = findFeature(input.argv, input.features);

  if (feature === undefined) {
    writeCliError(input.io, namespaceError(namespace), false);
    input.io.stderr.write(`\n${buildUsage(input.features)}\n`);
    return 1;
  }

  const parsed = feature.parse(input.argv);

  if (result.isErr(parsed)) {
    writeCliError(input.io, parsed.error, false);
    input.io.stderr.write(`\n${feature.usage}\n`);
    return 1;
  }

  if (parsed.value === 'help') {
    input.io.stdout.write(`${feature.usage}\n`);
    return 0;
  }

  const command = parsed.value;
  const client = feature.makeClient(input.env);

  if (result.isErr(client)) {
    writeCliError(input.io, client.error, command.json);
    return 1;
  }

  try {
    if (command.json || !feature.interactive || !isTty(input.io.stdout))
      return await runPlainCommand(feature, command, client.value, input.io);

    return await runInteractiveCommand(
      feature,
      command,
      client.value,
      input.io,
    );
  } catch (error) {
    writeCliError(input.io, normalizeUnknownError(error), command.json);
    return 1;
  } finally {
    await client.value.close();
  }
};
