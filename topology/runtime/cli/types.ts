import type { ExecutableCliCatalog } from '@pressly/cells';
import type { IdSource } from '@pressly/cells/id-source';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';

export type PresslyCliMissingEnvironmentValue = Readonly<{
  code: string;
  message: string;
  safeMessage: string;
}>;

export type PresslyCliEnvironmentValueBinding = Readonly<{
  environmentKey: string;
  defaultValue?: string;
  missing?: PresslyCliMissingEnvironmentValue;
}>;

export type PresslyCliRuntimeSelection = Readonly<{
  catalog: Readonly<{
    commandPrefixes: readonly (readonly string[])[];
    remoteCommandPrefixes: readonly (readonly string[])[];
    includeProgram: boolean;
    beforeStdinDatabaseOperationIds: readonly string[];
    contextBindings: readonly Readonly<{
      operationId: string;
      requirement: string;
      fields: Readonly<Record<string, PresslyCliEnvironmentValueBinding>>;
    }>[];
  }>;
  output: 'deferred' | 'streaming';
  database: Readonly<{
    environmentKey: string;
    missingCode: string;
    purpose: string;
    maxConnections: number;
  }>;
  diagnostic: Readonly<{
    environmentKey: string;
    enabledValue: string;
    failure: PresslyCliMissingEnvironmentValue;
  }> | null;
}>;

export type PresslyCliRuntimeInvocation = Readonly<{
  selection: PresslyCliRuntimeSelection;
  argv: readonly string[];
}>;

export type PresslyCliHostOperation = Readonly<{
  operationId: string;
  observability: string;
  commandId: string;
  commandName: readonly string[];
  authentication: 'none' | 'required';
  contextRequirements: readonly string[];
  capabilityRequirements: readonly string[];
}>;

export type PresslyCliBoundaryInput = Readonly<{
  arguments: Readonly<Record<string, string | readonly string[]>>;
  options: Readonly<Record<string, boolean | string | readonly string[]>>;
  stdin: string | null;
}>;

export type PresslyCliFileAccess = Readonly<{
  read: (path: string) => Promise<string | undefined>;
  writePrivate: (path: string, value: string) => Promise<void>;
  clear: (path: string) => Promise<void>;
  readText: (path: string) => Promise<string>;
}>;

export type PresslyCliRuntimeResource = Readonly<{
  kind: 'client' | 'database';
  close: () => Promise<void>;
}>;

export type PresslyCliRuntimeAssemblyInput = Readonly<{
  selection: PresslyCliRuntimeSelection;
  apiUrl: string | undefined;
  fetch: typeof globalThis.fetch;
  files: PresslyCliFileAccess;
  sessionPath: string;
  ensureDatabase: () => PostgresDatabase;
  registerResource: (resource: PresslyCliRuntimeResource) => void;
  clock: Clock;
  ids: IdSource;
  configuration: Readonly<{ read: (key: string) => string | undefined }>;
}>;

export type PresslyCliRuntimeAssembly = Readonly<{
  catalog: ExecutableCliCatalog;
  beforeStdin?: (operation: PresslyCliHostOperation) => void;
  resolveContext: (
    input: Readonly<{
      operation: PresslyCliHostOperation;
      requirement: string;
      boundary: PresslyCliBoundaryInput;
      signal: AbortSignal;
    }>,
  ) => Promise<unknown> | unknown;
  requireCapability: (
    input: Readonly<{
      operation: PresslyCliHostOperation;
      capability: string;
      timing: 'after-input' | 'before-input';
      scope: string | null;
      boundary: PresslyCliBoundaryInput;
      context: Readonly<Record<string, unknown>>;
      decodedInput: unknown | null;
      signal: AbortSignal;
    }>,
  ) => Promise<void> | void;
}>;

export type PresslyCliRuntimeComposer = (
  input: PresslyCliRuntimeAssemblyInput,
) => PresslyCliRuntimeAssembly;
