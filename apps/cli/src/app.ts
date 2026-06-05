import { makeApiAuthClient, makeAuthCli } from './features/auth/index.ts';
import {
  makeApiPricingClient,
  makePricingCli,
} from './features/pricing/index.ts';
import { runCli, type RunCliInput } from './shell/run-cli.ts';
import { makeSessionStore } from './shell/session-store.ts';

export type RunPresslyCliInput = Omit<RunCliInput, 'features'>;

export const runPresslyCli = async (
  input: RunPresslyCliInput,
): Promise<number> => {
  const sessionStore = makeSessionStore();

  return runCli({
    ...input,
    features: [
      makeAuthCli({
        makeAuthClient: (env) => makeApiAuthClient(env, sessionStore),
      }),
      makePricingCli({
        makePricingClient: (env) => makeApiPricingClient(env, sessionStore),
      }),
    ],
  });
};
