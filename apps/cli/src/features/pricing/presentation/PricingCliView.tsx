import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { result } from '@pressly/kernel';
import {
  normalizeUnknownError,
  presentAppError,
  type AppError,
} from '@pressly/errors';
import type {
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import { commandError } from '../../../shell/command-error.ts';
import { toPricingChangeInput } from '../application/command.ts';
import type {
  PricingChangeInput,
  PricingClient,
} from '../application/ports.ts';
import {
  renderPricingCatalog,
  renderPricingPlan,
  renderPricingPublishResult,
} from './presenter.ts';
import type { PricingCliCommand } from '../application/command.ts';

type AppState =
  | Readonly<{ tag: 'loading'; message: string }>
  | Readonly<{ tag: 'catalog'; catalog: LoadPricingCatalogResult }>
  | Readonly<{ tag: 'plan'; plan: PricingChangePlan }>
  | Readonly<{
      tag: 'confirm';
      input: PricingChangeInput;
      plan: PricingChangePlan;
    }>
  | Readonly<{ tag: 'publishing'; message: string }>
  | Readonly<{ tag: 'published'; result: PublishPricingChangeResult }>
  | Readonly<{ tag: 'cancelled' }>
  | Readonly<{ tag: 'error'; error: AppError }>;

export type PricingCliViewProps = Readonly<{
  command: PricingCliCommand;
  client: PricingClient;
}>;

const Lines = ({ value }: { value: string }) => (
  <Box flexDirection="column">
    {value.split('\n').map((line, index) => (
      <Text key={`${index}-${line}`}>{line === '' ? ' ' : line}</Text>
    ))}
  </Box>
);

const SpinnerLine = ({ children }: { children: string }) => (
  <Text color="cyan">{children}</Text>
);

const ErrorView = ({ error }: { error: AppError }) => (
  <Lines value={presentAppError(error)} />
);

const exitCodeForState = (state: AppState): number =>
  state.tag === 'error' || state.tag === 'cancelled' ? 1 : 0;

const asAppError = (error: unknown): AppError => normalizeUnknownError(error);

export const PricingCliView = ({ command, client }: PricingCliViewProps) => {
  const app = useApp();
  const [state, setState] = useState<AppState>({
    tag: 'loading',
    message: 'Loading pricing...',
  });

  const changeInput = useMemo(() => {
    if (command.action === 'show') return undefined;

    return toPricingChangeInput(command);
  }, [command]);

  useEffect(() => {
    let active = true;

    const setIfActive = (next: AppState) => {
      if (active) setState(next);
    };

    const run = async () => {
      try {
        if (command.action === 'show') {
          const catalogResult = await client.loadCatalog({
            serviceSlug: command.serviceSlug,
            ...(command.locationSlug === undefined
              ? {}
              : { locationSlug: command.locationSlug }),
          });

          setIfActive(
            result.isOk(catalogResult)
              ? { tag: 'catalog', catalog: catalogResult.value }
              : { tag: 'error', error: catalogResult.error },
          );
          return;
        }

        if (changeInput === undefined || result.isErr(changeInput)) {
          setIfActive({
            tag: 'error',
            error:
              changeInput === undefined
                ? commandError('Missing pricing change input.')
                : changeInput.error,
          });
          return;
        }

        if (command.action === 'plan') {
          const planResult = await client.planChange(changeInput.value);

          setIfActive(
            result.isOk(planResult)
              ? { tag: 'plan', plan: planResult.value }
              : { tag: 'error', error: planResult.error },
          );
          return;
        }

        if (command.confirm) {
          setIfActive({
            tag: 'publishing',
            message: 'Publishing pricing change...',
          });

          const publishResult = await client.publishChange(changeInput.value);

          setIfActive(
            result.isOk(publishResult)
              ? { tag: 'published', result: publishResult.value }
              : { tag: 'error', error: publishResult.error },
          );
          return;
        }

        const plan = await client.planChange(changeInput.value);

        setIfActive(
          result.isOk(plan)
            ? { tag: 'confirm', input: changeInput.value, plan: plan.value }
            : { tag: 'error', error: plan.error },
        );
      } catch (error) {
        setIfActive({ tag: 'error', error: asAppError(error) });
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [changeInput, client, command]);

  useEffect(() => {
    if (
      state.tag === 'catalog' ||
      state.tag === 'plan' ||
      state.tag === 'published' ||
      state.tag === 'cancelled' ||
      state.tag === 'error'
    ) {
      app.exit(exitCodeForState(state));
    }
  }, [app, state]);

  useInput(
    async (input, key) => {
      if (state.tag !== 'confirm') return;

      if (input.toLowerCase() === 'n' || key.escape) {
        setState({ tag: 'cancelled' });
        return;
      }

      if (input.toLowerCase() !== 'y') return;

      setState({ tag: 'publishing', message: 'Publishing pricing change...' });

      try {
        const publishResult = await client.publishChange(state.input);

        setState(
          result.isOk(publishResult)
            ? { tag: 'published', result: publishResult.value }
            : { tag: 'error', error: publishResult.error },
        );
      } catch (error) {
        setState({ tag: 'error', error: asAppError(error) });
      }
    },
    { isActive: state.tag === 'confirm' },
  );

  if (state.tag === 'loading' || state.tag === 'publishing')
    return <SpinnerLine>{state.message}</SpinnerLine>;

  if (state.tag === 'catalog')
    return <Lines value={renderPricingCatalog(state.catalog)} />;

  if (state.tag === 'plan')
    return <Lines value={renderPricingPlan(state.plan)} />;

  if (state.tag === 'confirm')
    return (
      <Box flexDirection="column">
        <Lines value={renderPricingPlan(state.plan)} />
        <Text> </Text>
        <Text color="yellow">
          Publish this pricing change? Press y to publish or n to cancel.
        </Text>
      </Box>
    );

  if (state.tag === 'published')
    return <Lines value={renderPricingPublishResult(state.result)} />;

  if (state.tag === 'cancelled')
    return <Text color="yellow">Pricing change cancelled.</Text>;

  return <ErrorView error={state.error} />;
};
