import type { ReactElement } from 'react';
import type { AppError, Result } from '@pressly/errors';

export type CliCommand = Readonly<{
  json: boolean;
}>;

export type CliClient = Readonly<{
  close: () => Promise<void>;
}>;

export type CliFeatureContext<Command extends CliCommand, Client> = Readonly<{
  command: Command;
  client: Client;
}>;

export type CliFeatureSpec<
  Command extends CliCommand,
  Client extends CliClient,
  Output,
> = Readonly<{
  namespace: string;
  usage: string;
  parse: (argv: readonly string[]) => Result<Command | 'help', AppError>;
  makeClient: (env: NodeJS.ProcessEnv) => Result<Client, AppError>;
  run: (command: Command, client: Client) => Promise<Result<Output, AppError>>;
  present: (output: Output) => string;
  serialize?: (output: Output) => unknown;
  interactive?: boolean;
  createView: (context: CliFeatureContext<Command, Client>) => ReactElement;
}>;

export type CliFeature = Readonly<{
  namespace: string;
  usage: string;
  parse: (argv: readonly string[]) => Result<CliCommand | 'help', AppError>;
  makeClient: (env: NodeJS.ProcessEnv) => Result<CliClient, AppError>;
  run: (
    command: CliCommand,
    client: CliClient,
  ) => Promise<Result<unknown, AppError>>;
  present: (output: unknown) => string;
  serialize: (output: unknown) => unknown;
  interactive: boolean;
  createView: (
    context: CliFeatureContext<CliCommand, CliClient>,
  ) => ReactElement;
}>;

/**
 * Creates a feautre based on the specification's feature in the command line. Includes All commands and variables available..
 */
export const makeCliFeature = <
  Command extends CliCommand,
  Client extends CliClient,
  Output,
>(
  spec: CliFeatureSpec<Command, Client, Output>,
): CliFeature => ({
  namespace: spec.namespace,
  usage: spec.usage,
  parse: spec.parse as CliFeature['parse'],
  makeClient: spec.makeClient as CliFeature['makeClient'],
  run: (command, client) => spec.run(command as Command, client as Client),
  present: (output) => spec.present(output as Output),
  serialize: (output) =>
    spec.serialize === undefined ? output : spec.serialize(output as Output),
  interactive: spec.interactive ?? true,
  createView: (context) =>
    spec.createView({
      command: context.command as Command,
      client: context.client as Client,
    }),
});
