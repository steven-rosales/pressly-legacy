import {
  makeAccessBootstrapCliSystem,
  makePostgresBootstrapOwner,
  type BootstrapOwner,
} from '@pressly/access-system';
import type { ExecutableCliCatalog } from '@pressly/cells';
import { configError } from '@pressly/errors/factories';
import {
  makeAdminCliExperience,
  type AdminCliAuthApi,
  type AdminCliPricingApi,
} from '@pressly/experience-control';
import {
  makeAdminCliClientFactory,
  makeAdminSessionStore,
  makeProductionBootstrap,
  productionBootstrapConcurrencyKey,
  readAdminApiUrl,
  type AdminCliClient,
  type AdminCliClientFactory,
  type ProductionAuthorities,
} from '@pressly/experience-control/cli/runtime';
import { withPostgresAdvisoryTransactionLock } from '@pressly/postgres/advisory-lock';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { presslyPostgresOwnerSchemas } from '../../pressly-postgres-schema.js';
import { makePresslyProductionAuthorities } from './production-authorities.js';
import type {
  PresslyCliRuntimeAssembly,
  PresslyCliRuntimeAssemblyInput,
  PresslyCliRuntimeComposer,
} from './types.js';

export type PresslyCliRuntimeOwners = Readonly<{
  'experience:control': ReturnType<typeof makeAdminCliExperience>;
  'system:access': ReturnType<typeof makeAccessBootstrapCliSystem>;
}>;

export type PresslyCliCatalogFactory = (
  owners: PresslyCliRuntimeOwners,
) => ExecutableCliCatalog;

export type PresslyCliRuntimeOverrides = Readonly<{
  adminClient?: AdminCliClientFactory;
  bootstrapOwner?: (db: PostgresDatabase) => BootstrapOwner;
  productionAuthorities?: (
    input: Readonly<{
      db: PostgresDatabase;
      clock: PresslyCliRuntimeAssemblyInput['clock'];
      ids: PresslyCliRuntimeAssemblyInput['ids'];
    }>,
  ) => ProductionAuthorities;
}>;

type CliCatalogEntry = ExecutableCliCatalog['entries'][number];

const withBeforeExecute = (
  entry: CliCatalogEntry,
  before: () => void,
): CliCatalogEntry => {
  const execute = async (input: unknown) => {
    before();
    return entry.execute(input);
  };
  return Object.freeze({
    ...entry,
    cell: Object.freeze({
      ...entry.cell,
      execute: async (input: never) => execute(input),
    }),
    execute,
  });
};

const selectedForRuntime = (
  entry: CliCatalogEntry,
  selection: PresslyCliRuntimeAssemblyInput['selection'],
): boolean => {
  const name = entry.surface.name;
  return selection.catalog.commandPrefixes.some(
    (prefix) =>
      prefix.length <= name.length &&
      prefix.every((value, index) => name[index] === value),
  );
};

const usesRemoteClient = (
  entry: CliCatalogEntry,
  selection: PresslyCliRuntimeAssemblyInput['selection'],
): boolean =>
  selection.catalog.remoteCommandPrefixes.some(
    (prefix) =>
      prefix.length <= entry.surface.name.length &&
      prefix.every((value, index) => entry.surface.name[index] === value),
  );

const contextValue = (
  input: PresslyCliRuntimeAssemblyInput,
  binding: PresslyCliRuntimeAssemblyInput['selection']['catalog']['contextBindings'][number]['fields'][string],
): string => {
  const configured = input.configuration.read(binding.environmentKey)?.trim();
  if (configured !== undefined && configured !== '') return configured;
  if (binding.defaultValue !== undefined) return binding.defaultValue;
  if (binding.missing !== undefined)
    throw configError({
      ...binding.missing,
      details: { key: binding.environmentKey },
    });
  throw configError({
    code: 'cli_environment_binding_invalid',
    message: `CLI environment binding ${binding.environmentKey} has neither a value, default, nor missing-value policy.`,
    safeMessage: 'The CLI command is not configured.',
    details: { key: binding.environmentKey },
  });
};

const resolveSelectedContext = (
  input: PresslyCliRuntimeAssemblyInput,
  operationId: string,
  requirement: string,
): Readonly<Record<string, string>> => {
  const binding = input.selection.catalog.contextBindings.find(
    (candidate) =>
      candidate.operationId === operationId &&
      candidate.requirement === requirement,
  );
  if (binding === undefined)
    throw configError({
      code: 'cli_context_requirement_unknown',
      message: `No topology binding exists for CLI context ${requirement}.`,
      safeMessage: 'The CLI command is not configured.',
    });
  return Object.freeze(
    Object.fromEntries(
      Object.entries(binding.fields).map(([field, value]) => [
        field,
        contextValue(input, value),
      ]),
    ),
  );
};

export const composePresslyCliRuntime = (
  input: PresslyCliRuntimeAssemblyInput,
  makeCatalog: PresslyCliCatalogFactory,
  overrides: PresslyCliRuntimeOverrides = {},
): PresslyCliRuntimeAssembly => {
  let adminClient: AdminCliClient | undefined;
  const ensureAdminClient = (): AdminCliClient => {
    if (adminClient !== undefined) return adminClient;
    adminClient = (
      overrides.adminClient ?? makeAdminCliClientFactory(input.fetch)
    )(readAdminApiUrl({ PRESSLY_API_URL: input.apiUrl }));
    input.registerResource({ kind: 'client', close: adminClient.close });
    return adminClient;
  };

  const authApi = new Proxy({} as AdminCliAuthApi, {
    get: (_target, property) => {
      const value = ensureAdminClient().auth[property as keyof AdminCliAuthApi];
      return typeof value === 'function'
        ? value.bind(ensureAdminClient().auth)
        : value;
    },
  });
  const pricingApi = new Proxy({} as AdminCliPricingApi, {
    get: (_target, property) => {
      const value =
        ensureAdminClient().pricing[property as keyof AdminCliPricingApi];
      return typeof value === 'function'
        ? value.bind(ensureAdminClient().pricing)
        : value;
    },
  });
  const session = makeAdminSessionStore({
    path: input.sessionPath,
    files: input.files,
  });
  const productionBootstrap = makeProductionBootstrap({
    authorities: () => {
      const authorityInput = {
        db: input.ensureDatabase(),
        clock: input.clock,
        ids: input.ids,
      };
      return (
        overrides.productionAuthorities?.(authorityInput) ??
        makePresslyProductionAuthorities(authorityInput)
      );
    },
    readText: input.files.readText,
    runExclusive: (work) =>
      withPostgresAdvisoryTransactionLock(
        input.ensureDatabase(),
        productionBootstrapConcurrencyKey,
        work,
      ),
  });
  const admin = makeAdminCliExperience({
    auth: { api: authApi, session },
    pricing: { api: pricingApi, session },
    productionBootstrap,
  });

  const lazyBootstrapOwner: BootstrapOwner = (command) => {
    const db = input.ensureDatabase();
    return (
      overrides.bootstrapOwner?.(db) ??
      makePostgresBootstrapOwner(db, presslyPostgresOwnerSchemas.access)
    )(command);
  };
  const access = makeAccessBootstrapCliSystem({
    bootstrapOwner: lazyBootstrapOwner,
  });
  const discoveredCatalog = makeCatalog({
    'experience:control': admin,
    'system:access': access,
  });
  const selectedEntries = discoveredCatalog.entries
    .filter((entry) => selectedForRuntime(entry, input.selection))
    .map((entry) =>
      usesRemoteClient(entry, input.selection)
        ? withBeforeExecute(entry, ensureAdminClient)
        : entry,
    );
  const catalog: ExecutableCliCatalog = Object.freeze({
    cells: Object.freeze(selectedEntries.map((entry) => entry.cell)),
    entries: Object.freeze(selectedEntries),
    ...(!input.selection.catalog.includeProgram ||
    discoveredCatalog.program === undefined
      ? {}
      : { program: discoveredCatalog.program }),
  });

  return Object.freeze({
    catalog,
    beforeStdin: (operation) => {
      if (
        input.selection.catalog.beforeStdinDatabaseOperationIds.includes(
          operation.operationId,
        )
      )
        input.ensureDatabase();
    },
    resolveContext: ({ operation, requirement }) =>
      resolveSelectedContext(input, operation.operationId, requirement),
    requireCapability: () => undefined,
  });
};

export const makePresslyCliRuntimeComposer =
  (makeCatalog: PresslyCliCatalogFactory): PresslyCliRuntimeComposer =>
  (input) =>
    composePresslyCliRuntime(input, makeCatalog);
