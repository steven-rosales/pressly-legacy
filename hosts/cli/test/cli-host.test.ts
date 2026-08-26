import {
  cli,
  decode,
  defineBoundaryContract,
  defineCellContract,
  defineCliCatalog,
  defineCliProgram,
  defineOperation,
  type CliInteractiveDriver,
  type CliPresentationManifest,
  type CliProgramManifest,
  type CliStdinPolicy,
} from '@pressly/cells';
import { validationError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import {
  resolveCliCommand,
  runCliHost,
  type CliHostDependencies,
} from '../src/public.ts';

type TestInput = Readonly<{
  target: string;
  file: string;
  labels: readonly string[];
  force: boolean;
  stdin: string | null;
  actor: unknown;
  confirmation: string | null;
}>;

const inputContract = defineBoundaryContract<TestInput>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'target' in serialized &&
    typeof serialized.target === 'string' &&
    'file' in serialized &&
    typeof serialized.file === 'string'
      ? decode.valid(serialized as TestInput)
      : decode.invalid([{ path: [], message: 'Expected command input.' }]),
  encode: (value) => value,
});

const textContract = defineBoundaryContract<string>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'string'
      ? decode.valid(serialized)
      : decode.invalid([{ path: [], message: 'Expected text.' }]),
  encode: (value) => value,
});

const contract = defineCellContract({
  input: inputContract,
  output: textContract,
  failure: textContract,
});

const presentation: CliPresentationManifest = Object.freeze({
  success: Object.freeze({
    stream: 'stdout',
    exitCodes: Object.freeze([0, 2]),
  }),
  failure: Object.freeze({
    stream: 'stderr',
    exitCodes: Object.freeze([3]),
  }),
  invalidInvocation: Object.freeze({ stream: 'stderr', exitCode: 64 }),
});

const program = defineCliProgram({
  id: 'example.cli-program.v1',
  helpOptions: ['--help', '-h'],
  help: { stdout: 'example global help\n', exitCode: 0 },
  unknown: {
    stream: 'stderr',
    exitCode: 1,
    prefix: 'Unknown namespace: ',
    suffix: '.\n\n',
    token: 'first',
    appendHelp: true,
  },
  groups: [
    {
      name: ['example'],
      help: { stdout: 'example group help\n', exitCode: 0 },
      unknown: {
        stream: 'stderr',
        exitCode: 1,
        prefix: 'Unknown example action.\n\n',
        suffix: '',
        token: 'none',
        appendHelp: true,
      },
    },
  ],
});

const requiredPipedStdin: CliStdinPolicy = Object.freeze({
  mode: 'required',
  encoding: 'utf8',
  maxBytes: 16,
  tty: 'forbid',
});

type CatalogOptions = Readonly<{
  commandId?: string;
  commandName?: readonly [string, ...string[]];
  stdin?: CliStdinPolicy;
  prompt?: 'allowed' | 'none';
  authorizationTiming?: 'after-input' | 'before-input';
  execute?: (
    input: TestInput,
  ) => Promise<
    | Readonly<{ kind: 'success'; value: string }>
    | Readonly<{ kind: 'failure'; failure: string }>
  >;
  presentSuccessExitCode?: number;
  serializedInput?: unknown;
  forceRepeatable?: boolean;
  interactive?: Readonly<{
    exitCodes: readonly number[];
    when?: (
      invocation: Parameters<
        CliInteractiveDriver<string, string>
      >[0]['invocation'],
    ) => boolean;
    drive: CliInteractiveDriver<string, string>;
  }>;
  program?: CliProgramManifest;
}>;

const makeCatalog = (calls: string[], options: CatalogOptions = {}) => {
  const commandId = options.commandId ?? 'example.apply.v1';
  const authorization =
    options.authorizationTiming === 'before-input'
      ? ({
          capability: 'example:write',
          timing: 'before-input',
        } as const)
      : ({
          capability: 'example:write',
          timing: 'after-input',
          scope: (input: TestInput) => `target:${input.target}`,
        } as const);
  const cell = defineOperation({
    kind: 'command',
    id: `example.${commandId.replace(/\.v[0-9]+$/, '').replaceAll('.', '-')}.v1`,
    contract,
    authorization,
    surfaces: [
      cli.command({
        id: commandId,
        name: options.commandName ?? ['example', 'apply'],
        arguments: [
          { name: 'target', required: true, variadic: false },
          { name: 'labels', required: false, variadic: true },
        ],
        options: [
          {
            name: 'file',
            short: 'f',
            value: 'string',
            required: true,
            repeatable: false,
          },
          {
            name: 'label',
            short: 'l',
            value: 'string',
            required: false,
            repeatable: true,
          },
          {
            name: 'force',
            short: 'y',
            value: 'boolean',
            required: false,
            repeatable: options.forceRepeatable ?? false,
          },
        ],
        stdin: options.stdin ?? requiredPipedStdin,
        prompt: options.prompt ?? 'allowed',
        contextRequirements: ['actor-context', 'trace-context'],
        capabilityRequirements: ['example:read', 'example:write'],
        ...(options.interactive === undefined
          ? {}
          : { interactive: options.interactive }),
        presentation,
        toSerializedInput: async (invocation) => {
          calls.push('map-input');
          const confirmation =
            invocation.prompt === null
              ? null
              : await invocation.prompt({ message: 'Continue?' });
          const positionalLabels = invocation.arguments['labels'];
          const optionLabels = invocation.options['label'];
          return Object.hasOwn(options, 'serializedInput')
            ? options.serializedInput
            : {
                target: invocation.arguments['target'],
                file: invocation.options['file'],
                labels: [
                  ...(Array.isArray(positionalLabels) ? positionalLabels : []),
                  ...(Array.isArray(optionLabels) ? optionLabels : []),
                ],
                force: invocation.options['force'] === true,
                stdin: invocation.stdin,
                actor: invocation.context['actor-context'],
                confirmation,
              };
        },
        present: (outcome) => {
          calls.push('present');
          return outcome.kind === 'success'
            ? {
                stdout: `${outcome.value}\n`,
                exitCode: options.presentSuccessExitCode ?? 0,
              }
            : { stderr: `${outcome.failure}\n`, exitCode: 3 };
        },
        presentInvalidInvocation: (failure) => ({
          stderr: `${failure.code}: ${failure.message}\n`,
          exitCode: 64,
        }),
      }),
    ],
    observability: { operation: 'example.apply' },
    execute:
      options.execute ??
      (async () => {
        calls.push('execute');
        return { kind: 'success', value: 'applied' } as const;
      }),
  });

  return defineCliCatalog([cell], options.program);
};

const makeDependencies = (
  calls: string[],
  overrides: Readonly<{
    argv?: readonly string[];
    stdin?: string | null;
    stdinIsTTY?: boolean;
    contextFailure?: unknown;
  }> = {},
) => {
  const output = { stdout: '', stderr: '', exitCode: -1 };
  const controller = new AbortController();
  const dependencies: CliHostDependencies = {
    process: {
      argv: {
        read: () => {
          calls.push('argv');
          return (
            overrides.argv ?? [
              '--',
              'example',
              'apply',
              'target-1',
              'positional-label',
              '-f',
              'manifest.json',
              '--label=first',
              '-l',
              'second',
              '-y',
            ]
          );
        },
      },
      prompt: {
        ask: async ({ request, signal }) => {
          calls.push(`prompt:${request.message}`);
          expect(signal).toBe(controller.signal);
          return 'yes';
        },
      },
      stdin: {
        isTTY: () => {
          calls.push('stdin:tty');
          return overrides.stdinIsTTY ?? false;
        },
        read: async ({ encoding, maxBytes, signal }) => {
          calls.push(`stdin:read:${encoding}:${String(maxBytes)}`);
          expect(signal).toBe(controller.signal);
          return overrides.stdin === undefined ? 'secret' : overrides.stdin;
        },
      },
      stdout: {
        write: (chunk) => {
          calls.push('stdout');
          output.stdout += chunk;
        },
      },
      stderr: {
        write: (chunk) => {
          calls.push('stderr');
          output.stderr += chunk;
        },
      },
      exit: {
        set: (code) => {
          calls.push(`exit:${String(code)}`);
          output.exitCode = code;
        },
      },
      signal: {
        read: () => {
          calls.push('signal');
          return controller.signal;
        },
      },
    },
    resolveContext: ({ requirement, signal }) => {
      calls.push(`context:${requirement}`);
      expect(signal).toBe(controller.signal);
      if (overrides.contextFailure !== undefined)
        throw overrides.contextFailure;
      return `${requirement}-value`;
    },
    requireCapability: ({ capability, timing, scope, decodedInput }) => {
      calls.push(`capability:${capability}:${timing}:${scope ?? '-'}`);
      if (timing === 'after-input') expect(decodedInput).not.toBeNull();
    },
  };
  return { dependencies, output, signal: controller.signal };
};

describe('generic CLI host', () => {
  it('resolves syntax, process effects, context, authorization, execution, and presentation in one exact order', async () => {
    const calls: string[] = [];
    let executedInput: TestInput | undefined;
    const catalog = makeCatalog(calls, {
      execute: async (input) => {
        calls.push('execute');
        executedInput = input;
        return { kind: 'success', value: 'applied' };
      },
    });
    const { dependencies, output } = makeDependencies(calls);

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(0);
    expect(output).toEqual({
      stdout: 'applied\n',
      stderr: '',
      exitCode: 0,
    });
    expect(executedInput).toEqual({
      target: 'target-1',
      file: 'manifest.json',
      labels: ['positional-label', 'first', 'second'],
      force: true,
      stdin: 'secret',
      actor: 'actor-context-value',
      confirmation: 'yes',
    });
    expect(calls).toEqual([
      'argv',
      'signal',
      'stdin:tty',
      'stdin:read:utf8:16',
      'context:actor-context',
      'context:trace-context',
      'capability:example:read:before-input:-',
      'map-input',
      'prompt:Continue?',
      'capability:example:write:after-input:target:target-1',
      'execute',
      'present',
      'stdout',
      'exit:0',
    ]);
  });

  it('preserves expected cell failure bytes, stream, and exit status', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, {
      execute: async () => {
        calls.push('execute');
        return { kind: 'failure', failure: 'not applied' };
      },
    });
    const { dependencies, output } = makeDependencies(calls);

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(3);
    expect(output).toEqual({
      stdout: '',
      stderr: 'not applied\n',
      exitCode: 3,
    });
  });

  it('presents contract-invalid mapped input without invoking the cell', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, { serializedInput: null });
    const { dependencies, output } = makeDependencies(calls);

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(64);
    expect(output.stderr).toContain('input_contract_invalid');
    expect(calls).not.toEqual(expect.arrayContaining(['execute', 'present']));
  });

  it('enforces declared before-input capabilities before mapping or contract decoding', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, {
      authorizationTiming: 'before-input',
    });
    const { dependencies } = makeDependencies(calls);

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(0);
    expect(
      calls.indexOf('capability:example:write:before-input:-'),
    ).toBeLessThan(calls.indexOf('map-input'));
    expect(calls).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^capability:example:write:after-input:/),
      ]),
    );
  });

  it.each([
    {
      name: 'unknown option',
      argv: ['example', 'apply', 'target-1', '-f', 'x', '--missing'],
      code: 'option_unknown',
    },
    {
      name: 'missing option value',
      argv: ['example', 'apply', 'target-1', '--file'],
      code: 'option_value_missing',
    },
    {
      name: 'boolean option value',
      argv: ['example', 'apply', 'target-1', '-f', 'x', '--force=true'],
      code: 'option_value_unexpected',
    },
    {
      name: 'repeated scalar option',
      argv: ['example', 'apply', 'target-1', '-f', 'x', '--file=y'],
      code: 'option_repeated',
    },
    {
      name: 'missing required option',
      argv: ['example', 'apply', 'target-1'],
      code: 'option_missing',
    },
    {
      name: 'missing required argument',
      argv: ['example', 'apply', '-f', 'x'],
      code: 'argument_missing',
    },
  ])(
    'presents $name without resolving application providers',
    async ({ argv, code }) => {
      const calls: string[] = [];
      const catalog = makeCatalog(calls);
      const { dependencies, output } = makeDependencies(calls, { argv });

      await expect(runCliHost({ catalog, dependencies })).resolves.toBe(64);
      expect(output.stderr).toContain(code);
      expect(calls).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^context:/),
          expect.stringMatching(/^capability:/),
          'execute',
        ]),
      );
    },
  );

  it('treats declared repeated boolean flags as idempotent true', async () => {
    const calls: string[] = [];
    let executedInput: TestInput | undefined;
    const catalog = makeCatalog(calls, {
      forceRepeatable: true,
      execute: async (input) => {
        executedInput = input;
        return { kind: 'success', value: 'applied' };
      },
    });
    const fixture = makeDependencies(calls, {
      argv: [
        'example',
        'apply',
        'target-1',
        '-f',
        'manifest.json',
        '--force',
        '--force',
      ],
    });

    await expect(
      runCliHost({ catalog, dependencies: fixture.dependencies }),
    ).resolves.toBe(0);
    expect(executedInput?.force).toBe(true);
  });

  it.each([
    {
      name: 'required input is absent',
      stdin: null,
      stdinIsTTY: false,
      expected: 'stdin_required',
    },
    {
      name: 'input exceeds the declared byte limit',
      stdin: 'x'.repeat(17),
      stdinIsTTY: false,
      expected: 'stdin_too_large',
    },
    {
      name: 'piped input is attached to a TTY',
      stdin: 'secret',
      stdinIsTTY: true,
      expected: 'stdin_tty_forbidden',
    },
  ])(
    'enforces stdin policy when $name',
    async ({ stdin, stdinIsTTY, expected }) => {
      const calls: string[] = [];
      const catalog = makeCatalog(calls);
      const { dependencies, output } = makeDependencies(calls, {
        stdin,
        stdinIsTTY,
      });

      await expect(runCliHost({ catalog, dependencies })).resolves.toBe(64);
      expect(output.stderr).toContain(expected);
      expect(calls).not.toEqual(expect.arrayContaining(['execute']));
    },
  );

  it('does not touch stdin or prompt when both are forbidden', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, {
      stdin: {
        mode: 'none',
        encoding: 'utf8',
        maxBytes: null,
        tty: 'allow',
      },
      prompt: 'none',
    });
    const { dependencies } = makeDependencies(calls);

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(0);
    expect(calls).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^stdin:/),
        expect.stringMatching(/^prompt:/),
      ]),
    );
  });

  it('supports absent optional stdin and required interactive stdin exactly as declared', async () => {
    const optionalCalls: string[] = [];
    const optionalCatalog = makeCatalog(optionalCalls, {
      stdin: {
        mode: 'optional',
        encoding: 'utf8',
        maxBytes: 16,
        tty: 'allow',
      },
    });
    const optional = makeDependencies(optionalCalls, { stdin: null });
    await expect(
      runCliHost({
        catalog: optionalCatalog,
        dependencies: optional.dependencies,
      }),
    ).resolves.toBe(0);
    expect(optionalCalls).toContain('stdin:read:utf8:16');

    const interactiveCalls: string[] = [];
    const interactiveCatalog = makeCatalog(interactiveCalls, {
      stdin: {
        mode: 'required',
        encoding: 'utf8',
        maxBytes: 16,
        tty: 'require',
      },
    });
    const nonInteractive = makeDependencies(interactiveCalls, {
      stdinIsTTY: false,
    });
    await expect(
      runCliHost({
        catalog: interactiveCatalog,
        dependencies: nonInteractive.dependencies,
      }),
    ).resolves.toBe(64);
    expect(nonInteractive.output.stderr).toContain('stdin_tty_required');
  });

  it('fails unknown and ambiguous command identities without invoking a cell', async () => {
    const unknownCalls: string[] = [];
    const unknownCatalog = makeCatalog(unknownCalls);
    const unknown = makeDependencies(unknownCalls, { argv: ['missing'] });
    await expect(
      runCliHost({
        catalog: unknownCatalog,
        dependencies: unknown.dependencies,
      }),
    ).resolves.toBe(1);
    expect(unknown.output.stderr).toMatch(/Unknown CLI command/);
    expect(unknownCalls).not.toEqual(
      expect.arrayContaining(['signal', 'execute']),
    );

    const ambiguousCalls: string[] = [];
    const first = makeCatalog(ambiguousCalls).cells[0]!;
    const second = makeCatalog(ambiguousCalls, {
      commandId: 'example.apply-detailed.v1',
      commandName: ['example', 'apply', 'detailed'],
    }).cells[0]!;
    const ambiguousCatalog = defineCliCatalog([first, second]);
    expect(
      resolveCliCommand(ambiguousCatalog, ['example', 'apply', 'detailed']),
    ).toMatchObject({
      kind: 'ambiguous',
      commandIds: ['example.apply-detailed.v1', 'example.apply.v1'],
    });
    const ambiguous = makeDependencies(ambiguousCalls, {
      argv: ['example', 'apply', 'detailed'],
    });
    await expect(
      runCliHost({
        catalog: ambiguousCatalog,
        dependencies: ambiguous.dependencies,
      }),
    ).resolves.toBe(1);
    expect(ambiguous.output.stderr).toBe(
      'The CLI command catalog is invalid.\n',
    );
    expect(ambiguousCalls).not.toEqual(
      expect.arrayContaining(['argv', 'signal', 'execute']),
    );
  });

  it('matches namespace-first commands across declared options without treating option values as actions', async () => {
    const calls: string[] = [];
    const applyCell = makeCatalog(calls).cells[0]!;
    const inspectCell = makeCatalog(calls, {
      commandId: 'example.inspect.v1',
      commandName: ['example', 'inspect'],
    }).cells[0]!;
    const catalog = defineCliCatalog([applyCell, inspectCell]);

    expect(
      resolveCliCommand(catalog, [
        'example',
        '--file',
        'inspect',
        'apply',
        'target-1',
        '--force',
      ]),
    ).toMatchObject({
      kind: 'matched',
      entry: { surface: { id: 'example.apply.v1' } },
      commandArgv: ['--file', 'inspect', 'target-1', '--force'],
    });
    expect(
      resolveCliCommand(catalog, [
        'example',
        '--file',
        'apply',
        'inspect',
        'target-1',
      ]),
    ).toMatchObject({
      kind: 'matched',
      entry: { surface: { id: 'example.inspect.v1' } },
    });
    expect(
      resolveCliCommand(catalog, [
        '--file',
        'manifest.json',
        'example',
        'apply',
      ]),
    ).toMatchObject({ kind: 'unknown' });

    const fixture = makeDependencies(calls, {
      argv: ['example', '-f', 'manifest.json', 'apply', 'target-1', '-y'],
    });
    await expect(
      runCliHost({ catalog, dependencies: fixture.dependencies }),
    ).resolves.toBe(0);
    expect(fixture.output.stdout).toBe('applied\n');
  });

  it('contains provider failures and rejects presentations outside the manifest', async () => {
    const providerCalls: string[] = [];
    const providerCatalog = makeCatalog(providerCalls);
    const provider = makeDependencies(providerCalls, {
      contextFailure: validationError({
        code: 'context_unavailable',
        message: 'Private context failure.',
        safeMessage: 'Context is unavailable.',
      }),
    });
    await expect(
      runCliHost({
        catalog: providerCatalog,
        dependencies: provider.dependencies,
      }),
    ).resolves.toBe(1);
    expect(provider.output.stderr).toBe('Context is unavailable.\n');
    expect(provider.output.stderr).not.toContain('Private context failure');

    const presentationCalls: string[] = [];
    const invalidPresentation = makeCatalog(presentationCalls, {
      presentSuccessExitCode: 9,
    });
    const presented = makeDependencies(presentationCalls);
    await expect(
      runCliHost({
        catalog: invalidPresentation,
        dependencies: presented.dependencies,
      }),
    ).resolves.toBe(1);
    expect(presented.output.stdout).toBe('');
    expect(presented.output.stderr).toBe(
      'The CLI command returned an invalid presentation.\n',
    );
  });

  it('preserves catalog-level global, group-help, and unknown-command bytes before providers run', async () => {
    const scenarios = [
      {
        argv: [] as readonly string[],
        stdout: 'example global help\n',
        stderr: '',
        exitCode: 0,
      },
      {
        argv: ['--help'],
        stdout: 'example global help\n',
        stderr: '',
        exitCode: 0,
      },
      {
        argv: ['example', 'apply', '--help'],
        stdout: 'example group help\n',
        stderr: '',
        exitCode: 0,
      },
      {
        argv: ['missing'],
        stdout: '',
        stderr: 'Unknown namespace: missing.\n\nexample global help\n',
        exitCode: 1,
      },
      {
        argv: ['example', 'missing'],
        stdout: '',
        stderr: 'Unknown example action.\n\nexample group help\n',
        exitCode: 1,
      },
    ];

    for (const scenario of scenarios) {
      const calls: string[] = [];
      const catalog = makeCatalog(calls, { program });
      const fixture = makeDependencies(calls, { argv: scenario.argv });

      await expect(
        runCliHost({ catalog, dependencies: fixture.dependencies }),
      ).resolves.toBe(scenario.exitCode);
      expect(fixture.output).toEqual({
        stdout: scenario.stdout,
        stderr: scenario.stderr,
        exitCode: scenario.exitCode,
      });
      expect(calls).not.toEqual(
        expect.arrayContaining([
          'signal',
          expect.stringMatching(/^stdin:/),
          expect.stringMatching(/^context:/),
          'execute',
        ]),
      );
    }
  });

  it('runs an owner-driven TTY session through the host-bound cell invocation', async () => {
    const calls: string[] = [];
    const frames: string[][] = [];
    const catalog = makeCatalog(calls, {
      interactive: {
        exitCodes: [0, 1],
        drive: async ({ invocation, session, invoke }) => {
          expect(invocation.command.id).toBe('example.apply.v1');
          await session.render({
            lines: [{ text: 'Loading...', tone: 'info' }],
          });
          const key = await session.readKey({ signal: invocation.signal });
          if (key.escape || key.input !== 'y') return 1;
          const invoked = await invoke();
          expect(invoked.kind).toBe('outcome');
          if (invoked.kind === 'invalid') return 1;
          await session.render({
            lines: [
              {
                text:
                  invoked.outcome.kind === 'success'
                    ? invoked.outcome.value
                    : invoked.outcome.failure,
              },
            ],
          });
          return invoked.outcome.kind === 'success' ? 0 : 1;
        },
      },
    });
    const fixture = makeDependencies(calls);
    const dependencies: CliHostDependencies = {
      ...fixture.dependencies,
      process: {
        ...fixture.dependencies.process,
        tty: {
          isTTY: () => {
            calls.push('tty:is-tty');
            return true;
          },
          run: async ({ drive, signal }) => {
            calls.push('tty:run');
            expect(signal).toBe(fixture.signal);
            return drive({
              render: (frame) => {
                calls.push('tty:render');
                frames.push(frame.lines.map((line) => line.text));
              },
              readKey: async ({ signal: keySignal }) => {
                calls.push('tty:key');
                expect(keySignal).toBe(signal);
                return { input: 'y', escape: false };
              },
            });
          },
        },
      },
    };

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(0);
    expect(frames).toEqual([['Loading...'], ['applied']]);
    expect(fixture.output).toEqual({ stdout: '', stderr: '', exitCode: 0 });
    expect(calls).toEqual([
      'argv',
      'signal',
      'stdin:tty',
      'stdin:read:utf8:16',
      'context:actor-context',
      'context:trace-context',
      'capability:example:read:before-input:-',
      'tty:is-tty',
      'tty:run',
      'tty:render',
      'tty:key',
      'map-input',
      'prompt:Continue?',
      'capability:example:write:after-input:target:target-1',
      'execute',
      'tty:render',
      'exit:0',
    ]);
  });

  it('uses plain presentation when the injected TTY runtime is not active', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, {
      interactive: {
        exitCodes: [0],
        when: () => false,
        drive: async () => {
          calls.push('interactive');
          return 0;
        },
      },
    });
    const fixture = makeDependencies(calls);
    const dependencies: CliHostDependencies = {
      ...fixture.dependencies,
      process: {
        ...fixture.dependencies.process,
        tty: {
          isTTY: () => {
            calls.push('tty:is-tty');
            return true;
          },
          run: async () => {
            calls.push('tty:run');
            return 0;
          },
        },
      },
    };

    await expect(runCliHost({ catalog, dependencies })).resolves.toBe(0);
    expect(fixture.output.stdout).toBe('applied\n');
    expect(calls).not.toEqual(
      expect.arrayContaining(['interactive', 'tty:is-tty', 'tty:run']),
    );
  });

  it('admits deliberately unbounded redirected stdin while retaining finite limits elsewhere', async () => {
    const calls: string[] = [];
    const catalog = makeCatalog(calls, {
      stdin: {
        mode: 'required',
        encoding: 'utf8',
        maxBytes: null,
        tty: 'forbid',
      },
    });
    const fixture = makeDependencies(calls, { stdin: 'x'.repeat(10_000) });

    await expect(
      runCliHost({ catalog, dependencies: fixture.dependencies }),
    ).resolves.toBe(0);
    expect(calls).toContain('stdin:read:utf8:null');
    expect(calls).toContain('execute');
  });

  it('fails closed on malformed program data and undeclared interactive exits', async () => {
    const malformedCalls: string[] = [];
    const malformedCatalog = makeCatalog(malformedCalls, {
      program: {
        ...program,
        helpOptions: ['-h', '-h'],
      },
    });
    const malformed = makeDependencies(malformedCalls);
    await expect(
      runCliHost({
        catalog: malformedCatalog,
        dependencies: malformed.dependencies,
      }),
    ).resolves.toBe(1);
    expect(malformed.output.stderr).toBe(
      'The CLI command catalog is invalid.\n',
    );
    expect(malformedCalls).not.toContain('argv');

    const interactiveCalls: string[] = [];
    const interactiveCatalog = makeCatalog(interactiveCalls, {
      interactive: {
        exitCodes: [0],
        drive: async () => 7,
      },
    });
    const interactive = makeDependencies(interactiveCalls);
    const dependencies: CliHostDependencies = {
      ...interactive.dependencies,
      process: {
        ...interactive.dependencies.process,
        tty: {
          isTTY: () => true,
          run: ({ drive }) =>
            drive({
              render: () => undefined,
              readKey: async () => ({ input: '', escape: false }),
            }),
        },
      },
    };
    await expect(
      runCliHost({ catalog: interactiveCatalog, dependencies }),
    ).resolves.toBe(1);
    expect(interactive.output.stderr).toBe(
      'The CLI command returned an invalid presentation.\n',
    );
  });
});
