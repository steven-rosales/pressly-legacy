import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  cli,
  decode,
  declareCommandCell,
  defineBoundaryContract,
  defineCellContract,
  defineCliProgram,
  type CellOutcome,
  type CliPresentationManifest,
} from '@pressly/cells';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import {
  compileTopology,
  defineSystem,
  defineTopology,
  resolveStaticArtifacts,
  selectCell,
  type CompiledTopology,
  type StaticCellManifest,
  type TopologyDefinition,
} from '../../topology/src/public.ts';

type CandidateInput = Readonly<{ value: string }>;
type CandidateOutput = Readonly<{ accepted: boolean }>;
type CandidateFailure = Readonly<{ code: 'rejected' }>;

const input = defineBoundaryContract<CandidateInput>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'value' in serialized &&
    typeof serialized.value === 'string'
      ? decode.valid({ value: serialized.value })
      : decode.invalid([{ path: [], message: 'Expected value.' }]),
  encode: (value) => value,
});

const output = defineBoundaryContract<CandidateOutput>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'accepted' in serialized &&
    typeof serialized.accepted === 'boolean'
      ? decode.valid({ accepted: serialized.accepted })
      : decode.invalid([{ path: [], message: 'Expected accepted.' }]),
  encode: (value) => value,
});

const failure = defineBoundaryContract<CandidateFailure>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'code' in serialized &&
    serialized.code === 'rejected'
      ? decode.valid({ code: 'rejected' })
      : decode.invalid([{ path: [], message: 'Expected rejection.' }]),
  encode: (value) => value,
});

const contract = defineCellContract({ input, output, failure });

const presentation: CliPresentationManifest = {
  success: { stream: 'stdout', exitCodes: [0, 2] },
  failure: { stream: 'stderr', exitCodes: [1] },
  invalidInvocation: { stream: 'stderr', exitCode: 64 },
};

const present = (outcome: CellOutcome<CandidateOutput, CandidateFailure>) =>
  outcome.kind === 'success'
    ? { stdout: `${String(outcome.value.accepted)}\n`, exitCode: 0 }
    : { stderr: `${outcome.failure.code}\n`, exitCode: 1 };

const makeCliManifest = (
  input: Readonly<{
    operationId: string;
    commandId: string;
    name: readonly [string, ...string[]];
    assemblyKey: string;
    authorizationTiming?: 'after-input' | 'before-input';
    interactive?: boolean;
    repeatableBoolean?: boolean;
  }>,
) => {
  const authorization =
    input.authorizationTiming === 'before-input'
      ? ({
          capability: 'candidate:write',
          timing: 'before-input',
        } as const)
      : ({
          capability: 'candidate:write',
          timing: 'after-input',
          scope: (value: CandidateInput) => `candidate:${value.value}`,
        } as const);
  const manifest = declareCommandCell({
    id: input.operationId,
    contract,
    authorization,
    surfaces: [
      cli.command<CandidateOutput, CandidateFailure>({
        id: input.commandId,
        name: input.name,
        arguments: [{ name: 'value', required: true, variadic: false }],
        options: [
          {
            name: 'json',
            short: 'j',
            value: 'boolean',
            required: false,
            repeatable: input.repeatableBoolean ?? false,
          },
        ],
        stdin: {
          mode: 'optional',
          encoding: 'utf8',
          maxBytes: 4_096,
          tty: 'allow',
        },
        prompt: 'allowed',
        contextRequirements: ['actor-context'],
        capabilityRequirements: ['candidate:write'],
        ...(input.interactive !== true
          ? {}
          : {
              interactive: {
                exitCodes: [0, 1],
                drive: async ({ invoke }) => {
                  const invoked = await invoke();
                  return invoked.kind === 'outcome' &&
                    invoked.outcome.kind === 'success'
                    ? 0
                    : 1;
                },
              },
            }),
        presentation,
        toSerializedInput: (invocation) => ({
          value: invocation.arguments['value'],
        }),
        present,
        presentInvalidInvocation: (error) => ({
          stderr: `${error.message}\n`,
          exitCode: 64,
        }),
      }),
    ],
    observability: { operation: input.operationId.replace(/\.v1$/, '') },
  });
  return {
    manifest,
    selection: selectCell({
      manifest,
      source: {
        moduleSpecifier: '@pressly/candidate-system',
        manifestExportName: `${input.assemblyKey}Manifest`,
        assemblyExportName: 'makeCandidateSystem',
        assemblyKey: input.assemblyKey,
      },
    }),
  };
};

const apply = makeCliManifest({
  operationId: 'candidate.apply.v1',
  commandId: 'candidate.apply-command.v1',
  name: ['candidate', 'apply'],
  assemblyKey: 'apply',
});

const inspect = makeCliManifest({
  operationId: 'candidate.inspect.v1',
  commandId: 'candidate.inspect-command.v1',
  name: ['candidate', 'inspect'],
  assemblyKey: 'inspect',
});

const cliProgram = defineCliProgram({
  id: 'candidate.cli-program.v1',
  helpOptions: ['--help', '-h'],
  help: { stdout: 'candidate help\n', exitCode: 0 },
  unknown: {
    stream: 'stderr',
    exitCode: 1,
    prefix: 'Unknown candidate command: ',
    suffix: '.\n',
    token: 'first',
    appendHelp: false,
  },
  groups: [
    {
      name: ['candidate'],
      help: { stdout: 'candidate group help\n', exitCode: 0 },
      unknown: {
        stream: 'stderr',
        exitCode: 1,
        prefix: 'Unknown candidate action.\n',
        suffix: '',
        token: 'after-group',
        appendHelp: false,
      },
    },
  ],
});

const candidateTopology = (
  reverse = false,
  withProgram = false,
): TopologyDefinition =>
  defineTopology({
    id: 'cli-candidate',
    systems: [
      defineSystem({
        id: 'candidate',
        cells: reverse
          ? [inspect.selection, apply.selection]
          : [apply.selection, inspect.selection],
      }),
    ],
    experiences: [],
    ...(withProgram ? { cliProgram } : {}),
  });

const expectCompiled = (definition: TopologyDefinition): CompiledTopology => {
  const compilation = compileTopology(definition);
  expect(compilation.kind).toBe('compiled');
  if (compilation.kind === 'invalid')
    throw new Error(JSON.stringify(compilation.violations));
  return compilation.topology;
};

const expectResolvedStaticArtifacts = (
  ...parameters: Parameters<typeof resolveStaticArtifacts>
) => {
  const resolution = resolveStaticArtifacts(...parameters);
  expect(resolution.kind).toBe('ready');
  return resolution.kind === 'ready' ? resolution.artifacts : [];
};

const violationCodes = (definition: TopologyDefinition): readonly string[] => {
  const compilation = compileTopology(definition);
  expect(compilation.kind).toBe('invalid');
  return compilation.kind === 'invalid'
    ? compilation.violations.map((entry) => entry.code)
    : [];
};

const topologyFor = (
  manifests: readonly Readonly<{
    manifest: StaticCellManifest;
    key: string;
  }>[],
): TopologyDefinition =>
  defineTopology({
    id: 'cli-validation',
    systems: [
      defineSystem({
        id: 'candidate',
        cells: manifests.map(({ manifest, key }) =>
          selectCell({
            manifest,
            source: {
              moduleSpecifier: '@pressly/candidate-system',
              manifestExportName: `${key}Manifest`,
              assemblyExportName: 'makeCandidateSystem',
              assemblyKey: key,
            },
          }),
        ),
      }),
    ],
    experiences: [],
  });

describe('selected CLI topology mechanism', () => {
  it('compiles deeply immutable, business-neutral command manifests', () => {
    const topology = expectCompiled(candidateTopology());
    expect(
      topology.cliCommands.map((entry) => ({
        operationId: entry.operationId,
        commandId: entry.surface.id,
        name: entry.surface.name,
      })),
    ).toEqual([
      {
        operationId: 'candidate.apply.v1',
        commandId: 'candidate.apply-command.v1',
        name: ['candidate', 'apply'],
      },
      {
        operationId: 'candidate.inspect.v1',
        commandId: 'candidate.inspect-command.v1',
        name: ['candidate', 'inspect'],
      },
    ]);

    const surface = topology.cliCommands[0]!.surface;
    for (const value of [
      surface,
      surface.name,
      surface.arguments,
      surface.arguments[0],
      surface.options,
      surface.options[0],
      surface.stdin,
      surface.contextRequirements,
      surface.capabilityRequirements,
      surface.presentation,
      surface.presentation.success,
      surface.presentation.success.exitCodes,
      surface.presentation.failure,
      surface.presentation.failure.exitCodes,
      surface.presentation.invalidInvocation,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it('accepts both authorization phases when the CLI capability is declared', () => {
    const beforeInput = makeCliManifest({
      operationId: 'candidate.authorize-first.v1',
      commandId: 'candidate.authorize-first-command.v1',
      name: ['candidate', 'authorize-first'],
      assemblyKey: 'authorizeFirst',
      authorizationTiming: 'before-input',
    });
    expect(
      expectCompiled(
        topologyFor([
          { manifest: beforeInput.manifest, key: 'authorizeFirst' },
        ]),
      ).cliCommands[0]?.operationId,
    ).toBe('candidate.authorize-first.v1');

    const repeatedBoolean = makeCliManifest({
      operationId: 'candidate.repeat-boolean.v1',
      commandId: 'candidate.repeat-boolean-command.v1',
      name: ['candidate', 'repeat-boolean'],
      assemblyKey: 'repeatBoolean',
      repeatableBoolean: true,
    });
    expect(
      expectCompiled(
        topologyFor([
          { manifest: repeatedBoolean.manifest, key: 'repeatBoolean' },
        ]),
      ).cliCommands[0]?.surface.options[0]?.repeatable,
    ).toBe(true);
  });

  it('compiles immutable program data, interactive policy, and explicit unbounded stdin', () => {
    const interactive = makeCliManifest({
      operationId: 'candidate.interactive.v1',
      commandId: 'candidate.interactive-command.v1',
      name: ['candidate', 'interactive'],
      assemblyKey: 'interactive',
      interactive: true,
    });
    const surface = interactive.manifest.surfaces[0]!;
    if (surface.kind !== 'cli') throw new Error('Expected CLI fixture.');
    const unbounded = Object.freeze({
      ...interactive.manifest,
      surfaces: Object.freeze([
        Object.freeze({
          ...surface,
          stdin: Object.freeze({
            mode: 'required' as const,
            encoding: 'utf8' as const,
            maxBytes: null,
            tty: 'forbid' as const,
          }),
        }),
      ]),
    });
    const definition = defineTopology({
      id: 'cli-interactive',
      systems: [
        defineSystem({
          id: 'candidate',
          cells: [
            selectCell({
              manifest: unbounded,
              source: interactive.selection.source,
            }),
          ],
        }),
      ],
      experiences: [],
      cliProgram,
    });

    const topology = expectCompiled(definition);
    expect(topology.cliProgram).toEqual(cliProgram);
    expect(topology.cliCommands[0]?.surface.stdin.maxBytes).toBeNull();
    expect(topology.cliCommands[0]?.surface.interactive).toEqual({
      exitCodes: [0, 1],
      when: expect.any(Function),
      drive: expect.any(Function),
    });
    for (const value of [
      topology.cliProgram,
      topology.cliProgram?.helpOptions,
      topology.cliProgram?.help,
      topology.cliProgram?.unknown,
      topology.cliProgram?.groups,
      topology.cliProgram?.groups[0],
      topology.cliProgram?.groups[0]?.name,
      topology.cliCommands[0]?.surface.interactive,
      topology.cliCommands[0]?.surface.interactive?.exitCodes,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it('generates one owner assembly and deterministic CLI inventory independent of selection order', () => {
    const first = expectResolvedStaticArtifacts(
      expectCompiled(candidateTopology()),
    );
    const second = expectResolvedStaticArtifacts(
      expectCompiled(candidateTopology(true)),
    );
    expect(second).toEqual(first);

    const source = first.find(
      (artifact) => artifact.path === 'generated/cli-catalog.ts',
    )?.content;
    expect(source).toContain(
      'import { makeCandidateSystem as assemble0 } from "@pressly/candidate-system";',
    );
    expect(source?.match(/await assemble0/g)).toHaveLength(1);
    expect(source).toContain('.cells["apply"]');
    expect(source).toContain('.cells["inspect"]');
    expect(source?.indexOf('.cells["apply"]')).toBeLessThan(
      source?.indexOf('.cells["inspect"]') ?? -1,
    );

    const architecture = first.find(
      (artifact) => artifact.path === 'generated/architecture-map.ts',
    )?.content;
    expect(architecture).toContain('"id": "candidate.apply-command.v1"');
    expect(architecture).toContain('"name": [');
    expect(architecture).toContain('"capabilityRequirements": [');
    expect(architecture).toContain('"invalidInvocation": {');

    const diagnostics = [source, architecture].flatMap((candidate) =>
      candidate === undefined
        ? []
        : (ts.transpileModule(candidate, {
            reportDiagnostics: true,
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          }).diagnostics ?? []),
    );
    expect(diagnostics).toEqual([]);
  });

  it('generates optional program data deterministically without changing the absent form', () => {
    const absent = expectResolvedStaticArtifacts(
      expectCompiled(candidateTopology()),
    ).find((artifact) => artifact.path === 'generated/cli-catalog.ts')?.content;
    const first = expectResolvedStaticArtifacts(
      expectCompiled(candidateTopology(false, true)),
    ).find((artifact) => artifact.path === 'generated/cli-catalog.ts')?.content;
    const second = expectResolvedStaticArtifacts(
      expectCompiled(candidateTopology(true, true)),
    ).find((artifact) => artifact.path === 'generated/cli-catalog.ts')?.content;

    expect(first).toBe(second);
    expect(first).toContain('"id": "candidate.cli-program.v1"');
    expect(first).toContain('"helpOptions": [');
    expect(first).toContain('"token": "after-group"');
    expect(absent).not.toContain('candidate.cli-program.v1');
    expect(absent).toContain('defineCliCatalog([');

    const diagnostics = ts.transpileModule(first ?? '', {
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).diagnostics;
    expect(diagnostics).toEqual([]);
  });

  it('rejects malformed catalog-level CLI program data', () => {
    const definition = defineTopology({
      id: 'invalid-cli-program',
      systems: candidateTopology().systems,
      experiences: [],
      cliProgram: {
        ...cliProgram,
        helpOptions: ['-h', '-h'],
      },
    });

    expect(violationCodes(definition)).toContain('invalid_cli_program');
  });

  it('rejects duplicate command identities, duplicate names, and prefix ambiguity', () => {
    const duplicateId = makeCliManifest({
      operationId: 'candidate.duplicate-id.v1',
      commandId: 'candidate.apply-command.v1',
      name: ['candidate', 'duplicate-id'],
      assemblyKey: 'duplicateId',
    });
    expect(
      violationCodes(
        topologyFor([
          { manifest: apply.manifest, key: 'apply' },
          { manifest: duplicateId.manifest, key: 'duplicateId' },
        ]),
      ),
    ).toContain('duplicate_cli_command_id');

    const duplicateName = makeCliManifest({
      operationId: 'candidate.duplicate-name.v1',
      commandId: 'candidate.duplicate-name-command.v1',
      name: ['candidate', 'apply'],
      assemblyKey: 'duplicateName',
    });
    expect(
      violationCodes(
        topologyFor([
          { manifest: apply.manifest, key: 'apply' },
          { manifest: duplicateName.manifest, key: 'duplicateName' },
        ]),
      ),
    ).toContain('duplicate_cli_command_name');

    const prefix = makeCliManifest({
      operationId: 'candidate.prefix.v1',
      commandId: 'candidate.prefix-command.v1',
      name: ['candidate'],
      assemblyKey: 'prefix',
    });
    expect(
      violationCodes(
        topologyFor([
          { manifest: apply.manifest, key: 'apply' },
          { manifest: prefix.manifest, key: 'prefix' },
        ]),
      ),
    ).toContain('ambiguous_cli_command_name');
  });

  it('rejects malformed syntax, requirements, stdin, and presentation data', () => {
    const surface = apply.manifest.surfaces[0]!;
    if (surface.kind !== 'cli') throw new Error('Expected CLI fixture.');
    const malformed = Object.freeze({
      ...apply.manifest,
      surfaces: Object.freeze([
        Object.freeze({
          ...surface,
          name: Object.freeze(['Candidate']) as never,
          arguments: Object.freeze([
            { name: 'value', required: false, variadic: false },
            { name: 'value', required: true, variadic: true },
          ]),
          options: Object.freeze([
            ...surface.options,
            { ...surface.options[0]!, name: surface.options[0]!.name },
          ]),
          stdin: Object.freeze({
            mode: 'required',
            encoding: 'utf8',
            maxBytes: 0,
            tty: 'forbid',
          }),
          contextRequirements: Object.freeze([
            'actor-context',
            'actor-context',
          ]),
          capabilityRequirements: Object.freeze(['not-a-capability']),
          presentation: Object.freeze({
            ...surface.presentation,
            failure: Object.freeze({
              stream: 'stderr',
              exitCodes: surface.presentation.success.exitCodes,
            }),
          }),
        }),
      ]),
    }) as unknown as StaticCellManifest;

    expect(
      violationCodes(topologyFor([{ manifest: malformed, key: 'malformed' }])),
    ).toEqual(
      expect.arrayContaining([
        'duplicate_cli_argument',
        'duplicate_cli_option',
        'duplicate_cli_requirement',
        'invalid_cell_semantics',
        'invalid_cli_presentation',
        'invalid_cli_requirement',
        'invalid_cli_surface',
      ]),
    );
  });

  it('selects the exact CLI program with a lazy Access bootstrap owner', () => {
    const topology = expectCompiled(presslyTopology);
    expect(topology.cells).toHaveLength(193);
    expect(topology.httpRoutes).toHaveLength(112);
    expect(topology.cliCommands.map((entry) => entry.operationId)).toEqual([
      'control.cli-auth-login.v1',
      'control.cli-auth-logout.v1',
      'control.cli-auth-mfa-confirm.v1',
      'control.cli-auth-mfa-enroll.v1',
      'control.cli-auth-mfa-recovery-codes.v1',
      'control.cli-auth-mfa-remove.v1',
      'control.cli-auth-session.v1',
      'access.bootstrap-owner.v2',
      'control.cli-bootstrap-production.v2',
      'control.cli-pricing-plan.v1',
      'control.cli-pricing-publish.v1',
      'control.cli-pricing-show.v1',
    ]);
    expect(topology.cliProgram?.id).toBe('control.pressly-admin-cli.v1');
    expect(topology.jobs.map((entry) => entry.operationId)).toEqual([
      'ingress.process-inbound-event.v1',
      'production.apply-fulfillment-demand.v1',
    ]);

    const source = expectResolvedStaticArtifacts(topology).find(
      (artifact) => artifact.path === 'generated/cli-catalog.ts',
    )?.content;
    expect(source).toContain(
      'import { makeAccessBootstrapCliSystem as assemble1 } from "@pressly/access-system";',
    );
    expect(source).toContain(
      'import { makeAdminCliExperience as assemble0 } from "@pressly/experience-control";',
    );
    expect(source).toContain(
      '"experience:control": Parameters<typeof assemble0>;',
    );
    expect(source).toContain('"system:access": Parameters<typeof assemble1>;');
    expect(source).toContain('owners["system:access"].cells["bootstrapOwner"]');
    expect(source).not.toContain('makeAccessSystem');
    expect(source).not.toContain('@pressly/production-system');
    expect(source).not.toContain('@pressly/ingress-system');
  });
});
