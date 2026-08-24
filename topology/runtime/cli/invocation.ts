import type {
  PresslyCliRuntimeInvocation,
  PresslyCliRuntimeSelection,
} from './types.js';

type InvocationProfile = Readonly<{
  invocationPrefix: readonly string[];
  argvPrefix: readonly string[];
  selection: PresslyCliRuntimeSelection;
}>;

const productionDatabase = Object.freeze({
  environmentKey: 'DATABASE_URL',
  missingCode: 'production_bootstrap_env_missing',
  purpose: 'for production bootstrap',
  maxConnections: 1,
});

const coordinatedProductionDatabase = Object.freeze({
  ...productionDatabase,
  maxConnections: 2,
});

const invocationProfiles = Object.freeze([
  Object.freeze({
    invocationPrefix: Object.freeze(['bootstrap', 'owner']),
    argvPrefix: Object.freeze(['bootstrap', 'owner']),
    selection: Object.freeze({
      catalog: Object.freeze({
        commandPrefixes: Object.freeze([Object.freeze(['bootstrap', 'owner'])]),
        remoteCommandPrefixes: Object.freeze([]),
        includeProgram: false,
        beforeStdinDatabaseOperationIds: Object.freeze([
          'access.bootstrap-owner.v2',
        ]),
        contextBindings: Object.freeze([
          Object.freeze({
            operationId: 'access.bootstrap-owner.v2',
            requirement: 'bootstrap-owner-environment',
            fields: Object.freeze({
              businessId: Object.freeze({
                environmentKey: 'PRESSLY_BOOTSTRAP_BUSINESS_ID',
                defaultValue: '00000000-0000-4000-8000-000000000100',
              }),
              businessSlug: Object.freeze({
                environmentKey: 'PRESSLY_BOOTSTRAP_BUSINESS_SLUG',
                missing: Object.freeze({
                  code: 'missing_bootstrap_owner_env',
                  message:
                    'PRESSLY_BOOTSTRAP_BUSINESS_SLUG is required to bootstrap the first owner.',
                  safeMessage: 'PRESSLY_BOOTSTRAP_BUSINESS_SLUG is required.',
                }),
              }),
              businessDisplayName: Object.freeze({
                environmentKey: 'PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME',
                missing: Object.freeze({
                  code: 'missing_bootstrap_owner_env',
                  message:
                    'PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME is required to bootstrap the first owner.',
                  safeMessage:
                    'PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME is required.',
                }),
              }),
              email: Object.freeze({
                environmentKey: 'PRESSLY_BOOTSTRAP_OWNER_EMAIL',
                missing: Object.freeze({
                  code: 'missing_bootstrap_owner_env',
                  message:
                    'PRESSLY_BOOTSTRAP_OWNER_EMAIL is required to bootstrap the first owner.',
                  safeMessage: 'PRESSLY_BOOTSTRAP_OWNER_EMAIL is required.',
                }),
              }),
              confirmation: Object.freeze({
                environmentKey: 'PRESSLY_BOOTSTRAP_OWNER_CONFIRM',
                missing: Object.freeze({
                  code: 'missing_bootstrap_owner_env',
                  message:
                    'PRESSLY_BOOTSTRAP_OWNER_CONFIRM is required to bootstrap the first owner.',
                  safeMessage: 'PRESSLY_BOOTSTRAP_OWNER_CONFIRM is required.',
                }),
              }),
            }),
          }),
        ]),
      }),
      output: 'deferred',
      database: Object.freeze({
        environmentKey: 'DATABASE_URL',
        missingCode: 'missing_bootstrap_owner_env',
        purpose: 'to bootstrap the first owner',
        maxConnections: 1,
      }),
      diagnostic: Object.freeze({
        environmentKey: 'PRESSLY_DEBUG_BOOTSTRAP_OWNER',
        enabledValue: '1',
        failure: Object.freeze({
          code: 'bootstrap_owner_failed',
          message: 'Owner bootstrap failed.',
          safeMessage: 'Owner bootstrap failed.',
        }),
      }),
    }),
  }),
  Object.freeze({
    invocationPrefix: Object.freeze(['bootstrap', 'production']),
    argvPrefix: Object.freeze(['bootstrap', 'production']),
    selection: Object.freeze({
      catalog: Object.freeze({
        commandPrefixes: Object.freeze([
          Object.freeze(['bootstrap', 'production']),
        ]),
        remoteCommandPrefixes: Object.freeze([]),
        includeProgram: false,
        beforeStdinDatabaseOperationIds: Object.freeze([]),
        contextBindings: Object.freeze([]),
      }),
      output: 'deferred',
      database: coordinatedProductionDatabase,
      diagnostic: null,
    }),
  }),
  Object.freeze({
    invocationPrefix: Object.freeze([]),
    argvPrefix: Object.freeze([]),
    selection: Object.freeze({
      catalog: Object.freeze({
        commandPrefixes: Object.freeze([
          Object.freeze(['auth']),
          Object.freeze(['pricing']),
        ]),
        remoteCommandPrefixes: Object.freeze([
          Object.freeze(['auth']),
          Object.freeze(['pricing']),
        ]),
        includeProgram: true,
        beforeStdinDatabaseOperationIds: Object.freeze([]),
        contextBindings: Object.freeze([]),
      }),
      output: 'streaming',
      database: productionDatabase,
      diagnostic: null,
    }),
  }),
] satisfies readonly [InvocationProfile, InvocationProfile, InvocationProfile]);

const startsWith = (
  values: readonly string[],
  prefix: readonly string[],
): boolean => prefix.every((value, index) => values[index] === value);

export const resolvePresslyCliRuntimeInvocation = (
  argv: readonly string[],
): PresslyCliRuntimeInvocation => {
  const profile =
    invocationProfiles.find(
      (candidate) =>
        candidate.invocationPrefix.length > 0 &&
        startsWith(argv, candidate.invocationPrefix),
    ) ?? invocationProfiles[2];

  const residual =
    profile.invocationPrefix.length === 0
      ? [...argv]
      : argv
          .slice(profile.invocationPrefix.length)
          .filter((value) => value !== '--');
  return Object.freeze({
    selection: profile.selection,
    argv: Object.freeze([...profile.argvPrefix, ...residual]),
  });
};
