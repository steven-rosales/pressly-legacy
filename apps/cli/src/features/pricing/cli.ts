import type { Result } from '@pressly/kernel';
import { createElement } from 'react';
import type { AppError } from '@pressly/errors/app-error';
import type { ApiClientEnv } from '../../shell/api-client.ts';
import { makeCliFeature } from '../../shell/feature.ts';
import { parsePricingCliCommand, usage } from './args.ts';
import {
  runPricingCommand,
  type PricingCliCommand,
  type PricingCliOutput,
} from './application/command.ts';
import type { PricingClient } from './application/ports.ts';
import { makeApiPricingClient } from './adapters/api-client.ts';
import { PricingCliView } from './presentation/PricingCliView.tsx';
import {
  presentPricingOutput,
  serializePricingOutput,
} from './presentation/presenter.ts';

export type PricingCliDeps = Readonly<{
  makePricingClient: (env: ApiClientEnv) => Result<PricingClient, AppError>;
}>;

const defaultDeps: PricingCliDeps = {
  makePricingClient: makeApiPricingClient,
};

export const makePricingCli = (deps: PricingCliDeps = defaultDeps) =>
  makeCliFeature<PricingCliCommand, PricingClient, PricingCliOutput>({
    namespace: 'pricing',
    usage,
    parse: parsePricingCliCommand,
    makeClient: deps.makePricingClient,
    run: runPricingCommand,
    present: presentPricingOutput,
    serialize: serializePricingOutput,
    createView: ({ command, client }) =>
      createElement(PricingCliView, {
        command,
        client,
      }),
  });
