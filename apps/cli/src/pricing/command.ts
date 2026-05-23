import type { PublishPricingChangeCommand } from '@pressly/contracts';
import {
  err,
  ok,
  validationError,
  type AppError,
  type Result,
} from '@pressly/errors';
import type { Actor } from '@pressly/auth';
import type { PricingChangeInput } from './client.ts';
import type { PricingCliCommand } from './args.ts';

export const commandError = (message: string, details?: unknown): AppError =>
  validationError({
    code: 'invalid_cli_command',
    message,
    safeMessage: message,
    ...(details === undefined ? {} : { details }),
  });

export const toPricingChangeInput = (
  command: PricingCliCommand,
): Result<PricingChangeInput, AppError> => {
  if (command.reason === undefined)
    return err(commandError('--reason is required for pricing changes.'));

  return ok({
    serviceSlug: command.serviceSlug,
    ...(command.locationSlug === undefined
      ? {}
      : { locationSlug: command.locationSlug }),
    reason: command.reason,
    items: [...command.items],
  });
};

export const toPublishPricingChangeCommand = (
  input: PricingChangeInput,
  actor: Actor,
): PublishPricingChangeCommand => ({
  serviceSlug: input.serviceSlug,
  ...(input.locationSlug === undefined
    ? {}
    : { locationSlug: input.locationSlug }),
  reason: input.reason,
  actor: {
    id: actor.id,
    kind: actor.kind,
    displayName: actor.displayName,
    role: actor.role,
  },
  items: [...input.items],
});
