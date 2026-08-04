import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  lpmsBootstrapManifestSchema,
  type LpmsBootstrapManifest,
} from '@pressly/contracts/lpms';
import {
  productionBootstrapManifestSchema,
  type ProductionBootstrapResult as ProductionBootstrapWireResult,
} from '@pressly/contracts/production';
import { type ManageSourceLocationBindingsResult as ManageSourceLocationBindingsWireResult } from '@pressly/contracts/webhook-ingestion';
import { createDatabaseRuntime } from '@pressly/db/client';
import { uuidIdSource } from '@pressly/kernel/node';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { configError, validationError } from '@pressly/errors/factories';
import {
  makePostgresProductionApplication,
  productionFailureToAppError,
  type ProductionApplication,
} from '@pressly/production';
import {
  makePostgresWebhookIngestionApplication,
  type WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import { systemClock } from '@pressly/time';
import { z } from 'zod';
import {
  toManageSourceLocationBindingsWireResult,
  toProductionBootstrapManifest,
  toProductionBootstrapWireResult,
  toSourceLocationBindingsManifest,
} from './bootstrap-production.contract.mapper.ts';

const commandInputSchema = z
  .object({
    file: z.string().min(1),
    actorId: z.uuid(),
    idempotencyKey: z.string().min(8).max(200),
    dryRun: z.boolean(),
  })
  .strict();

export type ProductionBootstrapCommandInput = z.infer<
  typeof commandInputSchema
>;

const valueAfter = (args: readonly string[], flag: string): string => {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw validationError({
      code: 'production_bootstrap_argument_missing',
      message: `${flag} requires a value.`,
      safeMessage: `${flag} requires a value.`,
      details: { flag },
    });
  return value;
};

export const parseProductionBootstrapArgs = (
  args: readonly string[],
): ProductionBootstrapCommandInput => {
  const normalized = args.filter((arg) => arg !== '--');
  const valueFlags = ['--file', '--actor-id', '--idempotency-key'];
  const allowed = new Set([...valueFlags, '--dry-run', '--apply']);
  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index]!;
    if (!allowed.has(argument))
      throw validationError({
        code: 'production_bootstrap_argument_unknown',
        message: `Unknown production bootstrap argument: ${argument}.`,
        safeMessage: `Unknown production bootstrap argument: ${argument}.`,
      });
    if (valueFlags.includes(argument)) index += 1;
  }
  if (normalized.includes('--dry-run') && normalized.includes('--apply'))
    throw validationError({
      code: 'production_bootstrap_mode_conflict',
      message: 'Choose either --dry-run or --apply.',
      safeMessage: 'Choose either --dry-run or --apply.',
    });

  return commandInputSchema.parse({
    file: valueAfter(normalized, '--file'),
    actorId: valueAfter(normalized, '--actor-id'),
    idempotencyKey: valueAfter(normalized, '--idempotency-key'),
    dryRun: !normalized.includes('--apply'),
  });
};

export const readProductionBootstrapManifest = async (
  file: string,
): Promise<LpmsBootstrapManifest> => {
  const source = await readFile(file, { encoding: 'utf8' });
  if (Buffer.byteLength(source, 'utf8') > 1_048_576)
    throw validationError({
      code: 'production_bootstrap_file_too_large',
      message: 'Production bootstrap input exceeds one MiB.',
      safeMessage: 'Production bootstrap input exceeds one MiB.',
    });

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw validationError({
      code: 'production_bootstrap_json_invalid',
      message: 'Production bootstrap input is not valid JSON.',
      safeMessage: 'Production bootstrap input is not valid JSON.',
      cause: error,
    });
  }
  const manifest = lpmsBootstrapManifestSchema.safeParse(parsed);
  if (!manifest.success)
    throw validationError({
      code: 'production_bootstrap_manifest_invalid',
      message: 'Production bootstrap manifest violates its contract.',
      safeMessage: 'Production bootstrap manifest is invalid.',
      details: {
        issues: manifest.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
    });
  return manifest.data;
};

export const executeProductionBootstrap = async (input: {
  command: ProductionBootstrapCommandInput;
  manageResources: ProductionApplication['manageProductionResources'];
  manageSourceLocationBindings: WebhookIngestionApplication['manageSourceLocationBindings'];
}): Promise<{
  production: ProductionBootstrapWireResult;
  sourceLocationBindings: ManageSourceLocationBindingsWireResult;
}> => {
  const manifest = await readProductionBootstrapManifest(input.command.file);
  const { sourceLocationBindings, ...productionManifestInput } = manifest;
  const bindingsManifest = toSourceLocationBindingsManifest(
    sourceLocationBindings,
  );
  const productionManifest = toProductionBootstrapManifest(
    productionBootstrapManifestSchema.parse(productionManifestInput),
  );
  const productionPreview = await input.manageResources({
    manifest: productionManifest,
    dryRun: true,
    actorId: input.command.actorId,
    idempotencyKey: input.command.idempotencyKey,
  });
  if (productionPreview.tag === 'err')
    throw productionFailureToAppError(productionPreview.error);
  const bindingsPreview = await input.manageSourceLocationBindings({
    manifest: bindingsManifest,
    dryRun: true,
  });

  if (
    input.command.dryRun ||
    productionPreview.value.status === 'rejected' ||
    bindingsPreview.value.status === 'rejected'
  )
    return {
      production: toProductionBootstrapWireResult(productionPreview.value),
      sourceLocationBindings: toManageSourceLocationBindingsWireResult(
        bindingsPreview.value,
      ),
    };

  const production = await input.manageResources({
    manifest: productionManifest,
    dryRun: false,
    actorId: input.command.actorId,
    idempotencyKey: input.command.idempotencyKey,
  });
  if (production.tag === 'err')
    throw productionFailureToAppError(production.error);
  const bindings = await input.manageSourceLocationBindings({
    manifest: bindingsManifest,
    dryRun: false,
  });
  return {
    production: toProductionBootstrapWireResult(production.value),
    sourceLocationBindings: toManageSourceLocationBindingsWireResult(
      bindings.value,
    ),
  };
};

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (value !== undefined && value.trim() !== '') return value;
  throw configError({
    code: 'production_bootstrap_env_missing',
    message: `${key} is required for production bootstrap.`,
    safeMessage: `${key} is required.`,
    details: { key },
  });
};

const main = async (): Promise<void> => {
  const command = parseProductionBootstrapArgs(process.argv.slice(2));
  const database = createDatabaseRuntime({
    databaseUrl: requiredEnv('DATABASE_URL'),
    maxConnections: 1,
  });
  try {
    const application = makePostgresProductionApplication({
      db: database.db,
      clock: systemClock,
      ids: uuidIdSource,
    });
    const webhookIngestion = makePostgresWebhookIngestionApplication({
      db: database.db,
      clock: systemClock,
      ids: uuidIdSource,
    });
    const outcome = await executeProductionBootstrap({
      command,
      manageResources: application.manageProductionResources,
      manageSourceLocationBindings:
        webhookIngestion.manageSourceLocationBindings,
    });
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    if (
      outcome.production.status === 'rejected' ||
      outcome.sourceLocationBindings.status === 'rejected'
    )
      process.exitCode = 2;
  } finally {
    await database.close();
  }
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain)
  main().catch((error: unknown) => {
    const normalized = normalizeUnknownError(error);
    process.stderr.write(`${normalized.safeMessage}\n`);
    process.exitCode = 1;
  });
