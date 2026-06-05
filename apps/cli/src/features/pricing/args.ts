import { parseArgs } from 'node:util';
import type {
  PricingServiceSlug,
  PublishPricingChangeItem,
} from '@pressly/contracts';
import {
  err,
  normalizeUnknownError,
  ok,
  validationError,
  type AppError,
  type Result,
} from '@pressly/errors';
import { commandError } from '../../shell/command-error.ts';
import type { PricingCliCommand } from './application/command.ts';

export const usage = [
  'Pressly pricing CLI',
  '',
  'Usage:',
  '  pressly-admin pricing show --service wash-fold [--location hoboken]',
  '  pressly-admin pricing plan --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee"',
  '  pressly-admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee" --yes',
  '',
  'Options:',
  '  --service   Pricing service: wash-fold or dry-cleaning',
  '  --location  Optional pricing location slug',
  '  --set       Item change as code=money. Repeat for multiple items',
  '  --reason    Required for plan/publish',
  '  --yes       Required to commit publish',
  '  --json      Print JSON output',
  '  --help      Show help',
].join('\n');

const isPricingServiceSlug = (value: string): value is PricingServiceSlug =>
  value === 'wash-fold' || value === 'dry-cleaning';

const getSingleString = (
  values: ReturnType<typeof parseArgs>['values'],
  key: string,
): string | undefined => {
  const value = values[key];

  if (value === undefined || typeof value === 'boolean') return undefined;
  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === 'string')
      .at(-1);

  return value;
};

const getStringList = (
  values: ReturnType<typeof parseArgs>['values'],
  key: string,
): readonly string[] => {
  const value = values[key];

  if (value === undefined || typeof value === 'boolean') return [];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');

  return [value];
};

const getBoolean = (
  values: ReturnType<typeof parseArgs>['values'],
  key: string,
): boolean => values[key] === true;

const parseMoneyCents = (value: string): Result<number, AppError> => {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;

  if (/^\d+c$/i.test(raw)) return ok(Number(raw.slice(0, -1)));

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
    return err(
      validationError({
        code: 'invalid_money_value',
        message: `Invalid money value: ${value}.`,
        safeMessage: 'Use a money value like 4.95, $4.95, or 495c.',
        details: { value },
      }),
    );

  const [dollars = '0', cents = ''] = raw.split('.');
  return ok(Number(dollars) * 100 + Number(cents.padEnd(2, '0')));
};

const parseItemChange = (
  value: string,
): Result<PublishPricingChangeItem, AppError> => {
  const separator = value.indexOf('=');

  if (separator <= 0 || separator === value.length - 1)
    return err(
      commandError('Use --set as item_code=money.', {
        value,
      }),
    );

  const code = value.slice(0, separator).trim();
  const price = parseMoneyCents(value.slice(separator + 1));

  if (code === '')
    return err(
      commandError('Pricing item code is required in --set.', {
        value,
      }),
    );

  if (!price.ok) return price;

  return ok({ code, priceCents: price.value });
};

const parseItemChanges = (
  values: readonly string[],
): Result<readonly PublishPricingChangeItem[], AppError> => {
  const items: PublishPricingChangeItem[] = [];

  for (const value of values) {
    const item = parseItemChange(value);

    if (!item.ok) return item;

    items.push(item.value);
  }

  return ok(items);
};

/**
 * Parses the arguments that happen after `--` in a node process script.
 */
export const parsePricingCliCommand = (
  argv: readonly string[],
): Result<PricingCliCommand | 'help', AppError> => {
  let parsed: ReturnType<typeof parseArgs>;
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        service: { type: 'string' },
        location: { type: 'string' },
        set: { type: 'string', multiple: true },
        reason: { type: 'string' },
        yes: { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return err(commandError(normalizeUnknownError(error).message));
  }

  if (getBoolean(parsed.values, 'help')) return ok('help');

  const [namespace, action] = parsed.positionals;

  if (namespace !== 'pricing')
    return err(commandError('Expected command namespace: pricing.'));

  if (action !== 'show' && action !== 'plan' && action !== 'publish')
    return err(
      commandError('Expected pricing action: show, plan, or publish.'),
    );

  const service = getSingleString(parsed.values, 'service');

  if (service === undefined || !isPricingServiceSlug(service))
    return err(
      commandError('Expected --service to be wash-fold or dry-cleaning.', {
        service,
      }),
    );

  const changes = parseItemChanges(getStringList(parsed.values, 'set'));

  if (!changes.ok) return changes;

  if (action !== 'show' && changes.value.length === 0)
    return err(commandError('At least one --set item is required.'));

  const reason = getSingleString(parsed.values, 'reason');

  if (action !== 'show' && (reason === undefined || reason.trim() === ''))
    return err(commandError('--reason is required for pricing changes.'));

  const locationSlug = getSingleString(parsed.values, 'location');

  return ok({
    action,
    serviceSlug: service,
    ...(locationSlug === undefined ? {} : { locationSlug }),
    ...(reason === undefined ? {} : { reason }),
    items: changes.value,
    confirm: getBoolean(parsed.values, 'yes'),
    json: getBoolean(parsed.values, 'json'),
  });
};
