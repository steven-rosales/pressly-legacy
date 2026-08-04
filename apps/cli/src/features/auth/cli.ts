import type { Result } from '@pressly/kernel';
import { createElement } from 'react';
import { Text } from 'ink';
import type { AppError } from '@pressly/errors/app-error';
import { makeCliFeature } from '../../shell/feature.ts';
import { authUsage, parseAuthCliCommand } from './args.ts';
import {
  runAuthCommand,
  type AuthCliCommand,
  type AuthCliOutput,
} from './application/command.ts';
import type { AuthCliClient } from './application/ports.ts';
import { makeApiAuthClient, type AuthCliEnv } from './adapters/api-client.ts';
import {
  presentAuthOutput,
  serializeAuthOutput,
} from './presentation/presenter.ts';

export type AuthCliDeps = Readonly<{
  makeAuthClient: (env: AuthCliEnv) => Result<AuthCliClient, AppError>;
}>;

const defaultDeps: AuthCliDeps = {
  makeAuthClient: makeApiAuthClient,
};

export const makeAuthCli = (deps: AuthCliDeps = defaultDeps) =>
  makeCliFeature<AuthCliCommand, AuthCliClient, AuthCliOutput>({
    namespace: 'auth',
    usage: authUsage,
    parse: parseAuthCliCommand,
    makeClient: deps.makeAuthClient,
    run: runAuthCommand,
    present: presentAuthOutput,
    serialize: serializeAuthOutput,
    interactive: false,
    createView: () => createElement(Text, null, ''),
  });
