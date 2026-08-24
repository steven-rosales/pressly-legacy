import type {
  CliInvocation,
  CliInvocationFailure,
  CliInteractiveInvocationResult,
  CliInteractiveSession,
  CliInteractiveSurface,
  CliOptionManifest,
  CliPresentation,
  CliProgramGroupManifest,
  CliProgramManifest,
  CliPresentationStream,
  CliPromptRequest,
  ExecutableCliCatalog,
} from '@pressly/cells';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';

type CliCatalogEntry = ExecutableCliCatalog['entries'][number];

export type CliHostOperation = Readonly<{
  operationId: string;
  observability: string;
  commandId: string;
  commandName: readonly string[];
  authentication: 'none' | 'required';
  contextRequirements: readonly string[];
  capabilityRequirements: readonly string[];
}>;

export type CliBoundaryInput = Readonly<{
  arguments: Readonly<Record<string, string | readonly string[]>>;
  options: Readonly<Record<string, boolean | string | readonly string[]>>;
  stdin: string | null;
}>;

export type CliProcessEffectProviders = Readonly<{
  argv: Readonly<{
    read: () => readonly string[];
  }>;
  prompt: Readonly<{
    ask: (
      input: Readonly<{
        operation: CliHostOperation;
        request: CliPromptRequest;
        signal: AbortSignal;
      }>,
    ) => Promise<string>;
  }>;
  stdin: Readonly<{
    isTTY: () => boolean;
    read: (
      input: Readonly<{
        operation: CliHostOperation;
        encoding: 'utf8';
        maxBytes: number | null;
        signal: AbortSignal;
      }>,
    ) => Promise<string | null>;
  }>;
  stdout: Readonly<{
    write: (chunk: string) => Promise<void> | void;
  }>;
  stderr: Readonly<{
    write: (chunk: string) => Promise<void> | void;
  }>;
  exit: Readonly<{
    set: (code: number) => void;
  }>;
  signal: Readonly<{
    read: () => AbortSignal;
  }>;
  tty?: Readonly<{
    isTTY: () => boolean;
    run: (
      input: Readonly<{
        operation: CliHostOperation;
        signal: AbortSignal;
        drive: (session: CliInteractiveSession) => Promise<number>;
      }>,
    ) => Promise<number>;
  }>;
}>;

export type CliHostDependencies = Readonly<{
  process: CliProcessEffectProviders;
  resolveContext: (
    input: Readonly<{
      operation: CliHostOperation;
      requirement: string;
      boundary: CliBoundaryInput;
      signal: AbortSignal;
    }>,
  ) => Promise<unknown> | unknown;
  requireCapability: (
    input: Readonly<{
      operation: CliHostOperation;
      capability: string;
      timing: 'after-input' | 'before-input';
      scope: string | null;
      boundary: CliBoundaryInput;
      context: Readonly<Record<string, unknown>>;
      decodedInput: unknown | null;
      signal: AbortSignal;
    }>,
  ) => Promise<void> | void;
}>;

export type CliCommandResolution =
  | Readonly<{
      kind: 'matched';
      entry: CliCatalogEntry;
      argv: readonly string[];
      commandArgv: readonly string[];
    }>
  | Readonly<{
      kind: 'unknown';
      argv: readonly string[];
    }>
  | Readonly<{
      kind: 'ambiguous';
      argv: readonly string[];
      commandIds: readonly string[];
    }>;

const normalizeArgv = (argv: readonly string[]): readonly string[] =>
  Object.freeze(argv[0] === '--' ? argv.slice(1) : [...argv]);

const commandArgvFor = (
  entry: CliCatalogEntry,
  argv: readonly string[],
): readonly string[] | null => {
  if (argv[0] !== entry.surface.name[0]) return null;
  const longOptions = new Map(
    entry.surface.options.map((option) => [option.name, option]),
  );
  const shortOptions = new Map(
    entry.surface.options.flatMap((option) =>
      option.short === null ? [] : [[option.short, option] as const],
    ),
  );
  const residual: string[] = [];
  let nameIndex = 1;
  let optionsEnabled = true;

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (optionsEnabled && token === '--') {
      residual.push(token);
      optionsEnabled = false;
      continue;
    }
    if (optionsEnabled && token.startsWith('-') && token !== '-') {
      residual.push(token);
      const separator = token.startsWith('--') ? token.indexOf('=') : -1;
      const longName = token.startsWith('--')
        ? token.slice(2, separator === -1 ? undefined : separator)
        : null;
      const shortName =
        longName === null && /^-[a-z0-9]$/.test(token) ? token.slice(1) : null;
      const option =
        longName === null
          ? shortName === null
            ? undefined
            : shortOptions.get(shortName)
          : longOptions.get(longName);
      const followingToken = argv[index + 1];
      if (
        option?.value === 'string' &&
        separator === -1 &&
        followingToken !== undefined
      ) {
        residual.push(followingToken);
        index += 1;
      }
      continue;
    }
    if (nameIndex < entry.surface.name.length) {
      if (token !== entry.surface.name[nameIndex]) return null;
      nameIndex += 1;
      continue;
    }
    residual.push(token);
  }

  return nameIndex === entry.surface.name.length
    ? Object.freeze(residual)
    : null;
};

export const resolveCliCommand = (
  catalog: ExecutableCliCatalog,
  rawArgv: readonly string[],
): CliCommandResolution => {
  const argv = normalizeArgv(rawArgv);
  const matches = catalog.entries.flatMap((entry) => {
    const commandArgv = commandArgvFor(entry, argv);
    return commandArgv === null ? [] : [{ entry, commandArgv }];
  });
  if (matches.length === 0) return Object.freeze({ kind: 'unknown', argv });
  const [match] = matches;
  if (matches.length === 1 && match !== undefined)
    return Object.freeze({
      kind: 'matched',
      entry: match.entry,
      argv,
      commandArgv: match.commandArgv,
    });

  return Object.freeze({
    kind: 'ambiguous',
    argv,
    commandIds: Object.freeze(
      matches.map(({ entry }) => entry.surface.id).sort(),
    ),
  });
};

const invocationFailure = (
  code: CliInvocationFailure['code'],
  message: string,
  details?: unknown,
): CliInvocationFailure =>
  Object.freeze({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });

type ParsedBoundaryResult =
  | Readonly<{ kind: 'parsed'; boundary: Omit<CliBoundaryInput, 'stdin'> }>
  | Readonly<{ kind: 'invalid'; failure: CliInvocationFailure }>;

const assignOption = (
  values: Record<string, boolean | string | readonly string[]>,
  option: CliOptionManifest,
  value: boolean | string,
): CliInvocationFailure | undefined => {
  const existing = values[option.name];
  if (existing === undefined) {
    values[option.name] = value;
    return undefined;
  }
  if (!option.repeatable)
    return invocationFailure(
      'option_repeated',
      `Option --${option.name} may be specified only once.`,
      { option: option.name },
    );

  if (option.value === 'boolean') return undefined;

  const repeated = Array.isArray(existing) ? existing : [String(existing)];
  values[option.name] = Object.freeze([...repeated, String(value)]);
  return undefined;
};

const parseBoundaryArguments = (
  entry: CliCatalogEntry,
  commandArgv: readonly string[],
): ParsedBoundaryResult => {
  const longOptions = new Map(
    entry.surface.options.map((option) => [option.name, option]),
  );
  const shortOptions = new Map(
    entry.surface.options.flatMap((option) =>
      option.short === null ? [] : [[option.short, option] as const],
    ),
  );
  const optionValues: Record<string, boolean | string | readonly string[]> = {};
  const positionals: string[] = [];
  let optionsEnabled = true;

  for (let index = 0; index < commandArgv.length; index += 1) {
    const token = commandArgv[index];
    if (token === undefined) continue;
    if (optionsEnabled && token === '--') {
      optionsEnabled = false;
      continue;
    }
    if (!optionsEnabled || !token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }

    const separator = token.startsWith('--') ? token.indexOf('=') : -1;
    const longName = token.startsWith('--')
      ? token.slice(2, separator === -1 ? undefined : separator)
      : null;
    const shortName =
      longName === null && /^-[a-z0-9]$/.test(token) ? token.slice(1) : null;
    const option =
      longName === null
        ? shortName === null
          ? undefined
          : shortOptions.get(shortName)
        : longOptions.get(longName);
    if (option === undefined)
      return Object.freeze({
        kind: 'invalid',
        failure: invocationFailure(
          'option_unknown',
          `Unknown option: ${token}.`,
          { option: token },
        ),
      });

    const inlineValue =
      separator === -1 ? undefined : token.slice(separator + 1);
    if (option.value === 'boolean') {
      if (inlineValue !== undefined)
        return Object.freeze({
          kind: 'invalid',
          failure: invocationFailure(
            'option_value_unexpected',
            `Option --${option.name} does not accept a value.`,
            { option: option.name },
          ),
        });
      const failure = assignOption(optionValues, option, true);
      if (failure !== undefined)
        return Object.freeze({ kind: 'invalid', failure });
      continue;
    }

    const value = inlineValue ?? commandArgv[index + 1];
    if (
      value === undefined ||
      (inlineValue === undefined && value.startsWith('-'))
    )
      return Object.freeze({
        kind: 'invalid',
        failure: invocationFailure(
          'option_value_missing',
          `Option --${option.name} requires a value.`,
          { option: option.name },
        ),
      });
    if (inlineValue === undefined) index += 1;
    const failure = assignOption(optionValues, option, value);
    if (failure !== undefined)
      return Object.freeze({ kind: 'invalid', failure });
  }

  for (const option of entry.surface.options)
    if (option.required && optionValues[option.name] === undefined)
      return Object.freeze({
        kind: 'invalid',
        failure: invocationFailure(
          'option_missing',
          `Required option --${option.name} is missing.`,
          { option: option.name },
        ),
      });

  const argumentValues: Record<string, string | readonly string[]> = {};
  let positionalIndex = 0;
  for (const argument of entry.surface.arguments) {
    if (argument.variadic) {
      const values = positionals.slice(positionalIndex);
      if (argument.required && values.length === 0)
        return Object.freeze({
          kind: 'invalid',
          failure: invocationFailure(
            'argument_missing',
            `Required argument ${argument.name} is missing.`,
            { argument: argument.name },
          ),
        });
      if (values.length > 0)
        argumentValues[argument.name] = Object.freeze(values);
      positionalIndex = positionals.length;
      continue;
    }

    const value = positionals[positionalIndex];
    if (value === undefined) {
      if (argument.required)
        return Object.freeze({
          kind: 'invalid',
          failure: invocationFailure(
            'argument_missing',
            `Required argument ${argument.name} is missing.`,
            { argument: argument.name },
          ),
        });
      continue;
    }
    argumentValues[argument.name] = value;
    positionalIndex += 1;
  }

  if (positionalIndex < positionals.length)
    return Object.freeze({
      kind: 'invalid',
      failure: invocationFailure(
        'argument_unexpected',
        'The command received unexpected positional arguments.',
        { count: positionals.length - positionalIndex },
      ),
    });

  return Object.freeze({
    kind: 'parsed',
    boundary: Object.freeze({
      arguments: Object.freeze(argumentValues),
      options: Object.freeze(optionValues),
    }),
  });
};

const operationFrom = (entry: CliCatalogEntry): CliHostOperation =>
  Object.freeze({
    operationId: entry.operationId,
    observability: entry.cell.observability.operation,
    commandId: entry.surface.id,
    commandName: entry.surface.name,
    authentication: entry.cell.authentication,
    contextRequirements: entry.surface.contextRequirements,
    capabilityRequirements: entry.surface.capabilityRequirements,
  });

type StdinResult =
  | Readonly<{ kind: 'read'; value: string | null }>
  | Readonly<{ kind: 'invalid'; failure: CliInvocationFailure }>;

const readStdin = async (
  entry: CliCatalogEntry,
  operation: CliHostOperation,
  effects: CliProcessEffectProviders,
  signal: AbortSignal,
): Promise<StdinResult> => {
  const policy = entry.surface.stdin;
  if (policy.mode === 'none')
    return Object.freeze({ kind: 'read', value: null });

  const tty = effects.stdin.isTTY();
  if (policy.tty === 'forbid' && tty)
    return Object.freeze({
      kind: 'invalid',
      failure: invocationFailure(
        'stdin_tty_forbidden',
        'This command requires redirected standard input.',
      ),
    });
  if (policy.tty === 'require' && !tty)
    return Object.freeze({
      kind: 'invalid',
      failure: invocationFailure(
        'stdin_tty_required',
        'This command requires an interactive standard input stream.',
      ),
    });

  const maxBytes = policy.maxBytes;
  const value = await effects.stdin.read({
    operation,
    encoding: policy.encoding,
    maxBytes,
    signal,
  });
  if (policy.mode === 'required' && value === null)
    return Object.freeze({
      kind: 'invalid',
      failure: invocationFailure(
        'stdin_required',
        'This command requires standard input.',
      ),
    });
  if (
    maxBytes !== null &&
    value !== null &&
    new TextEncoder().encode(value).byteLength > maxBytes
  )
    return Object.freeze({
      kind: 'invalid',
      failure: invocationFailure(
        'stdin_too_large',
        `Standard input exceeds ${String(maxBytes)} bytes.`,
        { maxBytes },
      ),
    });

  return Object.freeze({ kind: 'read', value });
};

const streamMatches = (
  presentation: CliPresentation,
  stream: CliPresentationStream,
): boolean =>
  stream === 'none'
    ? presentation.stdout === undefined && presentation.stderr === undefined
    : stream === 'stdout'
      ? presentation.stderr === undefined
      : presentation.stdout === undefined;

const assertOutcomePresentation = (
  entry: CliCatalogEntry,
  outcomeKind: 'failure' | 'success',
  presentation: CliPresentation,
): void => {
  const policy = entry.surface.presentation[outcomeKind];
  if (
    !policy.exitCodes.includes(presentation.exitCode) ||
    !streamMatches(presentation, policy.stream)
  )
    throw invariantViolationError({
      code: 'cli_cell_presentation_invalid',
      message: `CLI command "${entry.surface.id}" returned a presentation outside its declared ${outcomeKind} policy.`,
      safeMessage: 'The CLI command returned an invalid presentation.',
      details: { commandId: entry.surface.id, outcomeKind, presentation },
    });
};

const assertInvalidInvocationPresentation = (
  entry: CliCatalogEntry,
  presentation: CliPresentation,
): void => {
  const policy = entry.surface.presentation.invalidInvocation;
  if (
    presentation.exitCode !== policy.exitCode ||
    !streamMatches(presentation, policy.stream)
  )
    throw invariantViolationError({
      code: 'cli_invalid_invocation_presentation_invalid',
      message: `CLI command "${entry.surface.id}" returned an invalid invocation presentation outside its declaration.`,
      safeMessage: 'The CLI command returned an invalid presentation.',
      details: { commandId: entry.surface.id, presentation },
    });
};

const writePresentation = async (
  presentation: CliPresentation,
  effects: CliProcessEffectProviders,
): Promise<number> => {
  if (presentation.stdout !== undefined)
    await effects.stdout.write(presentation.stdout);
  if (presentation.stderr !== undefined)
    await effects.stderr.write(presentation.stderr);
  effects.exit.set(presentation.exitCode);
  return presentation.exitCode;
};

const presentInvalidInvocation = async (
  entry: CliCatalogEntry,
  failure: CliInvocationFailure,
  effects: CliProcessEffectProviders,
): Promise<number> => {
  const presentation = entry.presentInvalidInvocation(failure);
  assertInvalidInvocationPresentation(entry, presentation);
  return writePresentation(presentation, effects);
};

const presentationBytes = (presentation: CliPresentation): string =>
  presentation.stdout ?? presentation.stderr ?? '';

const programGroupFor = (
  program: CliProgramManifest,
  argv: readonly string[],
): CliProgramGroupManifest | undefined =>
  program.groups.find(
    (group) =>
      group.name.length <= argv.length &&
      group.name.every((token, index) => argv[index] === token),
  );

const helpRequestedBeforeSeparator = (
  program: CliProgramManifest,
  argv: readonly string[],
  offset: number,
): boolean => {
  const separator = argv.indexOf('--', offset);
  const end = separator === -1 ? argv.length : separator;
  return argv
    .slice(offset, end)
    .some((token) => program.helpOptions.includes(token));
};

const programHelpPresentation = (
  program: CliProgramManifest,
  argv: readonly string[],
): CliPresentation | undefined => {
  if (
    argv.length === 0 ||
    (argv[0] !== undefined && program.helpOptions.includes(argv[0]))
  )
    return program.help;

  const group = programGroupFor(program, argv);
  return group !== undefined &&
    helpRequestedBeforeSeparator(program, argv, group.name.length)
    ? group.help
    : undefined;
};

const unknownToken = (
  template: CliProgramManifest['unknown'],
  argv: readonly string[],
  group: CliProgramGroupManifest | undefined,
): string => {
  if (template.token === 'none') return '';
  if (template.token === 'first') return argv[0] ?? '';
  return group === undefined ? '' : (argv[group.name.length] ?? '');
};

const programUnknownPresentation = (
  program: CliProgramManifest,
  argv: readonly string[],
): CliPresentation => {
  const group = programGroupFor(program, argv);
  const template = group?.unknown ?? program.unknown;
  const help = group?.help ?? program.help;
  const bytes = `${template.prefix}${unknownToken(
    template,
    argv,
    group,
  )}${template.suffix}${template.appendHelp ? presentationBytes(help) : ''}`;
  return Object.freeze({
    [template.stream]: bytes,
    exitCode: template.exitCode,
  });
};

const genericResolutionFailure = async (
  resolution: Exclude<CliCommandResolution, { kind: 'matched' }>,
  catalog: ExecutableCliCatalog,
  effects: CliProcessEffectProviders,
): Promise<number> => {
  if (resolution.kind === 'unknown' && catalog.program !== undefined)
    return writePresentation(
      programUnknownPresentation(catalog.program, resolution.argv),
      effects,
    );

  const available = catalog.entries
    .map((entry) => entry.surface.name.join(' '))
    .sort();
  const message =
    resolution.kind === 'ambiguous'
      ? 'The CLI command is ambiguous.'
      : available.length === 0
        ? 'No CLI commands are registered.'
        : `Unknown CLI command. Available commands: ${available.join(', ')}.`;
  await effects.stderr.write(`${message}\n`);
  effects.exit.set(1);
  return 1;
};

const cliPresentationValid = (presentation: CliPresentation): boolean =>
  Number.isInteger(presentation.exitCode) &&
  presentation.exitCode >= 0 &&
  presentation.exitCode <= 255 &&
  (presentation.stdout === undefined) !== (presentation.stderr === undefined);

const programUnknownValid = (
  value: CliProgramManifest['unknown'],
  allowAfterGroup: boolean,
): boolean =>
  (value.stream === 'stderr' || value.stream === 'stdout') &&
  Number.isInteger(value.exitCode) &&
  value.exitCode > 0 &&
  value.exitCode <= 255 &&
  (value.token === 'first' ||
    value.token === 'none' ||
    (allowAfterGroup && value.token === 'after-group')) &&
  typeof value.prefix === 'string' &&
  typeof value.suffix === 'string' &&
  typeof value.appendHelp === 'boolean';

const assertProgramManifest = (
  program: CliProgramManifest | undefined,
): void => {
  if (program === undefined) return;
  const helpOptions = new Set(program.helpOptions);
  const groupNames = new Set<string>();
  const valid =
    program.id.trim() !== '' &&
    program.helpOptions.length > 0 &&
    helpOptions.size === program.helpOptions.length &&
    program.helpOptions.every((option) => option.startsWith('-')) &&
    cliPresentationValid(program.help) &&
    program.help.exitCode === 0 &&
    programUnknownValid(program.unknown, false) &&
    program.groups.every((group) => {
      const name = group.name.join('\u0000');
      if (name === '' || groupNames.has(name)) return false;
      groupNames.add(name);
      return (
        cliPresentationValid(group.help) &&
        group.help.exitCode === 0 &&
        programUnknownValid(group.unknown, true)
      );
    });
  const groupNamesList = [...groupNames].map((name) => name.split('\u0000'));
  let groupsOverlap = false;
  for (let leftIndex = 0; leftIndex < groupNamesList.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < groupNamesList.length;
      rightIndex += 1
    ) {
      const left = groupNamesList[leftIndex];
      const right = groupNamesList[rightIndex];
      if (left === undefined || right === undefined) continue;
      const shorter = left.length <= right.length ? left : right;
      const longer = shorter === left ? right : left;
      if (
        shorter.length < longer.length &&
        shorter.every((token, index) => token === longer[index])
      )
        groupsOverlap = true;
    }
  if (!valid || groupsOverlap)
    throw invariantViolationError({
      code: 'cli_program_manifest_invalid',
      message: `CLI program "${program.id}" has an invalid help or unknown-command presentation.`,
      safeMessage: 'The CLI command catalog is invalid.',
    });
};

const assertCatalogIdentities = (catalog: ExecutableCliCatalog): void => {
  assertProgramManifest(catalog.program);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of catalog.entries) {
    const name = entry.surface.name.join('\u0000');
    if (ids.has(entry.surface.id) || names.has(name))
      throw invariantViolationError({
        code: 'cli_catalog_identity_ambiguous',
        message: `CLI catalog repeats command identity or name at "${entry.surface.id}".`,
        safeMessage: 'The CLI command catalog is invalid.',
      });
    ids.add(entry.surface.id);
    names.add(name);
  }

  const commandNames = [...names].map((name) => name.split('\u0000'));
  for (let leftIndex = 0; leftIndex < commandNames.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < commandNames.length;
      rightIndex += 1
    ) {
      const left = commandNames[leftIndex];
      const right = commandNames[rightIndex];
      if (left === undefined || right === undefined) continue;
      const shorter = left.length <= right.length ? left : right;
      const longer = shorter === left ? right : left;
      if (
        shorter.length < longer.length &&
        shorter.every((token, index) => token === longer[index])
      )
        throw invariantViolationError({
          code: 'cli_catalog_name_ambiguous',
          message: `CLI catalog contains prefix-ambiguous command names "${shorter.join(' ')}" and "${longer.join(' ')}".`,
          safeMessage: 'The CLI command catalog is invalid.',
        });
    }
};

export const runCliHost = async (
  input: Readonly<{
    catalog: ExecutableCliCatalog;
    dependencies: CliHostDependencies;
  }>,
): Promise<number> => {
  const effects = input.dependencies.process;
  try {
    assertCatalogIdentities(input.catalog);
    const argv = normalizeArgv(effects.argv.read());
    if (input.catalog.program !== undefined) {
      const help = programHelpPresentation(input.catalog.program, argv);
      if (help !== undefined) return await writePresentation(help, effects);
    }

    const resolution = resolveCliCommand(input.catalog, argv);
    if (resolution.kind !== 'matched')
      return await genericResolutionFailure(resolution, input.catalog, effects);

    const { entry } = resolution;
    const operation = operationFrom(entry);
    const signal = effects.signal.read();
    const parsed = parseBoundaryArguments(entry, resolution.commandArgv);
    if (parsed.kind === 'invalid')
      return await presentInvalidInvocation(entry, parsed.failure, effects);

    const stdin = await readStdin(entry, operation, effects, signal);
    if (stdin.kind === 'invalid')
      return await presentInvalidInvocation(entry, stdin.failure, effects);
    const boundary: CliBoundaryInput = Object.freeze({
      ...parsed.boundary,
      stdin: stdin.value,
    });

    const contextEntries: [string, unknown][] = [];
    for (const requirement of entry.surface.contextRequirements)
      contextEntries.push([
        requirement,
        await input.dependencies.resolveContext({
          operation,
          requirement,
          boundary,
          signal,
        }),
      ]);
    const context = Object.freeze(Object.fromEntries(contextEntries));

    const authorization = entry.authorization;
    for (const capability of entry.surface.capabilityRequirements) {
      if (
        authorization?.timing === 'after-input' &&
        authorization.capability === capability
      )
        continue;
      await input.dependencies.requireCapability({
        operation,
        capability,
        timing: 'before-input',
        scope: null,
        boundary,
        context,
        decodedInput: null,
        signal,
      });
    }

    const invocation: CliInvocation = Object.freeze({
      command: Object.freeze({
        id: entry.surface.id,
        name: entry.surface.name,
      }),
      ...boundary,
      context,
      prompt:
        entry.surface.prompt === 'none'
          ? null
          : (request: CliPromptRequest) =>
              effects.prompt.ask({ operation, request, signal }),
      signal,
    });
    const invoke = async (
      serializedInput?: unknown,
    ): Promise<CliInteractiveInvocationResult<unknown, unknown>> => {
      const decoded =
        serializedInput === undefined
          ? await entry.decodeInvocation(invocation)
          : entry.decodeInput(serializedInput);
      if (decoded.kind === 'invalid')
        return Object.freeze({
          kind: 'invalid',
          failure: invocationFailure(
            'input_contract_invalid',
            'The command input violates its contract.',
            { issues: decoded.issues },
          ),
        });

      if (authorization?.timing === 'after-input')
        await input.dependencies.requireCapability({
          operation,
          capability: authorization.capability,
          timing: authorization.timing,
          scope: authorization.resolveScope(decoded.value),
          boundary,
          context,
          decodedInput: decoded.value,
          signal,
        });

      return Object.freeze({
        kind: 'outcome',
        outcome: await entry.execute(decoded.value),
      });
    };

    const interactive = entry.surface.interactive as CliInteractiveSurface<
      unknown,
      unknown
    > | null;
    const tty = effects.tty;
    if (
      interactive !== null &&
      interactive.when(invocation) &&
      tty !== undefined &&
      tty.isTTY()
    ) {
      const exitCode = await tty.run({
        operation,
        signal,
        drive: (session) => interactive.drive({ invocation, session, invoke }),
      });
      if (!interactive.exitCodes.includes(exitCode))
        throw invariantViolationError({
          code: 'cli_interactive_exit_invalid',
          message: `CLI command "${entry.surface.id}" returned interactive exit ${String(exitCode)} outside its declaration.`,
          safeMessage: 'The CLI command returned an invalid presentation.',
          details: { commandId: entry.surface.id, exitCode },
        });
      effects.exit.set(exitCode);
      return exitCode;
    }

    const invoked = await invoke();
    if (invoked.kind === 'invalid')
      return await presentInvalidInvocation(entry, invoked.failure, effects);

    const outcome = invoked.outcome;
    const presentation = entry.present(outcome, invocation);
    assertOutcomePresentation(entry, outcome.kind, presentation);
    return await writePresentation(presentation, effects);
  } catch (error: unknown) {
    const normalized = normalizeUnknownError(error);
    await effects.stderr.write(`${normalized.safeMessage}\n`);
    effects.exit.set(1);
    return 1;
  }
};
