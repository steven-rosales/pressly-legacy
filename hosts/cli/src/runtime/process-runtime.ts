import type { ExecutableCliCatalog } from '@pressly/cells';
import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { configError, validationError } from '@pressly/errors/factories';
import { makeAbortReason } from '@pressly/errors/abort-reason';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { resolveCliRuntimeInvocation } from '@pressly/topology/cli';
import { uuidIdSource } from '@pressly/cells/id-source/node';
import { systemClock, type Clock } from '@pressly/time';
import type { IdSource } from '@pressly/cells/id-source';
import {
  runCliHost,
  type CliBoundaryInput,
  type CliHostDependencies,
  type CliHostOperation,
  type CliProcessEffectProviders,
} from '../cli-host.js';
import { makeInkCliTty } from '../ink-tty.js';
import {
  adminSessionPath,
  nodeCliFileAccess,
  type CliFileAccess,
} from './filesystem.js';

type CliRuntimeInvocation = ReturnType<typeof resolveCliRuntimeInvocation>;

export type CliWriter = Readonly<{
  write: (chunk: string) => unknown;
}>;

export type CliIo = Readonly<{
  stdin?: NodeJS.ReadStream;
  stdout: CliWriter | NodeJS.WriteStream;
  stderr: CliWriter | NodeJS.WriteStream;
}>;

export type CliDatabaseResource = Readonly<{
  db: PostgresDatabase;
  close: () => Promise<void>;
}>;

export type CliDatabaseFactory = (
  input: Readonly<{
    databaseUrl: string;
    maxConnections: number;
  }>,
) => CliDatabaseResource;

export type CliRuntimeResource = Readonly<{
  kind: 'client' | 'database';
  close: () => Promise<void>;
}>;

export type CliRuntimeAssemblyInput = Readonly<{
  selection: CliRuntimeInvocation['selection'];
  apiUrl: string | undefined;
  fetch: typeof globalThis.fetch;
  files: CliFileAccess;
  sessionPath: string;
  ensureDatabase: () => PostgresDatabase;
  registerResource: (resource: CliRuntimeResource) => void;
  clock: Clock;
  ids: IdSource;
  configuration: Readonly<{ read: (key: string) => string | undefined }>;
}>;

export type CliRuntimeAssembly = Readonly<{
  catalog: ExecutableCliCatalog;
  beforeStdin?: (operation: CliHostOperation) => void;
  resolveContext: CliHostDependencies['resolveContext'];
  requireCapability: CliHostDependencies['requireCapability'];
}>;

export type CliRuntimeComposer = (
  input: CliRuntimeAssemblyInput,
) => CliRuntimeAssembly;

export type CliRuntimeDependencies = Readonly<{
  database?: CliDatabaseFactory;
  fetch?: typeof globalThis.fetch;
  files?: CliFileAccess;
  sessionPath?: string;
  signal?: AbortSignal;
  tty?: NonNullable<CliProcessEffectProviders['tty']>;
}>;

export type RunCliRuntimeInput = Readonly<{
  invocation: CliRuntimeInvocation;
  environment: NodeJS.ProcessEnv;
  io: CliIo;
  dependencies?: CliRuntimeDependencies;
}>;

class OutputBuffer {
  readonly #chunks: string[] = [];

  constructor(private readonly forward?: CliWriter) {}

  write = (chunk: string): void => {
    this.#chunks.push(chunk);
    this.forward?.write(chunk);
  };

  text = (): string => this.#chunks.join('');

  replace = (chunk: string): void => {
    this.#chunks.splice(0, this.#chunks.length, chunk);
    this.forward?.write(chunk);
  };
}

const requiredEnvironmentValue = (
  environment: NodeJS.ProcessEnv,
  key: string,
  errorCode: string,
  purpose: string,
): string => {
  const value = environment[key];
  if (value !== undefined && value.trim() !== '') return value;
  throw configError({
    code: errorCode,
    message: `${key} is required ${purpose}.`,
    safeMessage: `${key} is required.`,
    details: { key },
  });
};

const ttyStreams = (
  io: CliIo,
): Readonly<{
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}> | null => {
  if (
    io.stdin === undefined ||
    !('isTTY' in io.stdout) ||
    !('isTTY' in io.stderr)
  )
    return null;
  return {
    stdin: io.stdin,
    stdout: io.stdout as NodeJS.WriteStream,
    stderr: io.stderr as NodeJS.WriteStream,
  };
};

const readAll = async (
  stream: NodeJS.ReadStream | undefined,
  encoding: 'utf8',
  maxBytes: number | null,
  signal: AbortSignal,
): Promise<string | null> => {
  if (stream === undefined) return null;
  const aborted = () =>
    signal.reason ??
    makeAbortReason({ name: 'AbortError', message: 'CLI input was aborted.' });
  if (signal.aborted) throw aborted();

  const chunks: Buffer[] = [];
  let byteLength = 0;
  const readLimit = maxBytes === null ? null : maxBytes + 1;
  const abort = () => stream.destroy(aborted());
  signal.addEventListener('abort', abort, { once: true });
  try {
    for await (const chunk of stream) {
      if (signal.aborted) throw aborted();
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), encoding);
      const accepted =
        readLimit === null
          ? bytes
          : bytes.subarray(0, Math.max(0, readLimit - byteLength));
      if (accepted.length > 0) {
        chunks.push(accepted);
        byteLength += accepted.length;
      }
      if (readLimit !== null && byteLength >= readLimit) {
        stream.pause();
        break;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
  }
  return Buffer.concat(chunks, byteLength).toString(encoding);
};

const createDefaultTty = (
  io: CliIo,
): NonNullable<CliProcessEffectProviders['tty']> | undefined => {
  const streams = ttyStreams(io);
  return streams === null ? undefined : makeInkCliTty(streams);
};

export const runCliRuntime = async (
  input: RunCliRuntimeInput,
  composeRuntime: CliRuntimeComposer,
): Promise<number> => {
  const dependencies = input.dependencies ?? {};
  const deferOutput = input.invocation.selection.output === 'deferred';
  const stdout = new OutputBuffer(deferOutput ? undefined : input.io.stdout);
  const stderr = new OutputBuffer(deferOutput ? undefined : input.io.stderr);
  const resources: CliRuntimeResource[] = [];
  let recordedError: AppError | undefined;
  const record = (error: unknown): AppError => {
    const normalized = normalizeUnknownError(error);
    recordedError = normalized;
    return normalized;
  };

  let database: CliDatabaseResource | undefined;
  const ensureDatabase = (): PostgresDatabase => {
    if (database !== undefined) return database.db;
    try {
      const factory = dependencies.database;
      if (factory === undefined)
        throw configError({
          code: 'cli_database_factory_missing',
          message: 'The selected CLI runtime has no database factory.',
          safeMessage: 'The CLI database runtime is unavailable.',
        });
      database = factory({
        databaseUrl: requiredEnvironmentValue(
          input.environment,
          input.invocation.selection.database.environmentKey,
          input.invocation.selection.database.missingCode,
          input.invocation.selection.database.purpose,
        ),
        maxConnections: input.invocation.selection.database.maxConnections,
      });
      resources.push({ kind: 'database', close: database.close });
      return database.db;
    } catch (error: unknown) {
      throw record(error);
    }
  };

  let assembly: CliRuntimeAssembly;
  try {
    assembly = composeRuntime({
      selection: input.invocation.selection,
      apiUrl: input.environment['PRESSLY_API_URL'],
      fetch: dependencies.fetch ?? globalThis.fetch,
      files: dependencies.files ?? nodeCliFileAccess,
      sessionPath: dependencies.sessionPath ?? adminSessionPath(),
      ensureDatabase,
      registerResource: (resource) => resources.push(resource),
      clock: systemClock,
      ids: uuidIdSource,
      configuration: { read: (key) => input.environment[key] },
    });
  } catch (error: unknown) {
    const normalized = record(error);
    stderr.write(`${normalized.safeMessage}\n`);
    if (deferOutput) input.io.stderr.write(stderr.text());
    return 1;
  }

  const tty = dependencies.tty ?? createDefaultTty(input.io);
  let exitCode: number;
  try {
    exitCode = await runCliHost({
      catalog: assembly.catalog,
      dependencies: {
        process: {
          argv: { read: () => input.invocation.argv },
          prompt: {
            ask: async () => {
              throw validationError({
                code: 'cli_prompt_unavailable',
                message: 'The CLI prompt provider is unavailable.',
                safeMessage: 'The CLI prompt provider is unavailable.',
              });
            },
          },
          stdin: {
            isTTY: () => input.io.stdin?.isTTY === true,
            read: async ({ operation, encoding, maxBytes, signal }) => {
              assembly.beforeStdin?.(operation);
              return readAll(input.io.stdin, encoding, maxBytes, signal);
            },
          },
          stdout: { write: stdout.write },
          stderr: { write: stderr.write },
          exit: { set: (code) => void (exitCode = code) },
          signal: {
            read: () => dependencies.signal ?? new AbortController().signal,
          },
          ...(tty === undefined ? {} : { tty }),
        },
        resolveContext: async (contextInput) => {
          try {
            return await assembly.resolveContext(contextInput);
          } catch (error: unknown) {
            throw record(error);
          }
        },
        requireCapability: async (capabilityInput) => {
          try {
            await assembly.requireCapability(capabilityInput);
          } catch (error: unknown) {
            throw record(error);
          }
        },
      },
    });
  } catch (error: unknown) {
    const normalized = record(error);
    stderr.write(`${normalized.safeMessage}\n`);
    exitCode = 1;
  }

  for (const resource of [...resources].reverse()) {
    try {
      await resource.close();
    } catch (error: unknown) {
      const normalized = record(error);
      if (resource.kind === 'database' || stderr.text() === '')
        stderr.replace(`${normalized.safeMessage}\n`);
      exitCode = 1;
    }
  }

  const diagnosticConfig = input.invocation.selection.diagnostic;
  if (
    diagnosticConfig !== null &&
    input.environment[diagnosticConfig.environmentKey] ===
      diagnosticConfig.enabledValue &&
    exitCode === 1
  ) {
    const failureMessage =
      stderr.text().trimEnd() || diagnosticConfig.failure.message;
    const diagnostic =
      recordedError ??
      validationError({
        code: diagnosticConfig.failure.code,
        message: failureMessage,
        safeMessage:
          stderr.text().trimEnd() || diagnosticConfig.failure.safeMessage,
      });
    stderr.write(`${diagnostic.stack ?? diagnostic.message}\n`);
  }

  if (deferOutput) {
    input.io.stdout.write(stdout.text());
    input.io.stderr.write(stderr.text());
  }
  return exitCode;
};

export type { CliBoundaryInput };
