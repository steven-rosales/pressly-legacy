import type {
  StaticArchitectureFeature,
  StaticArchitecturePaths,
} from '@pressly/cells';
import type { CompiledTopology } from './compiler.ts';

export type ArchitectureExplanation = Readonly<{
  operationId: string;
  kind: string;
  authentication: 'none' | 'required';
  owner: string;
  source: string;
  paths: StaticArchitecturePaths | null;
  authorization: string | null;
  consistency: readonly string[];
  consumers: readonly string[];
  protocols: readonly string[];
  cli: readonly string[];
  contextRequirements: readonly string[];
  eventStreams: readonly string[];
  http: readonly string[];
  jobs: readonly string[];
  emits: readonly string[];
  consumes: readonly string[];
  experienceConsumers: readonly string[];
  experienceFeatures: readonly StaticArchitectureFeature[];
  observability: string;
}>;

export type ExplainOperationResult =
  | Readonly<{ kind: 'found'; explanation: ArchitectureExplanation }>
  | Readonly<{ kind: 'not-found'; operationId: string }>;

export const explainOperation = (
  topology: CompiledTopology,
  operationId: string,
  operationPaths: Readonly<Record<string, StaticArchitecturePaths>> = {},
): ExplainOperationResult => {
  const compiled = topology.cells.find(
    (cell) => cell.manifest.id === operationId,
  );
  if (compiled === undefined)
    return Object.freeze({ kind: 'not-found', operationId });

  const consumers = topology.experiences
    .filter((experience) => experience.operationIds.includes(operationId))
    .map((experience) => experience.id)
    .sort();
  const consistency = [
    `transaction: ${compiled.manifest.consistency.transaction}`,
    `concurrency: ${compiled.manifest.consistency.concurrency}`,
    `idempotency: ${compiled.manifest.idempotency.required ? 'required' : 'not-required'}`,
  ];
  const emitted = new Set(compiled.manifest.emits.map((event) => event.id));
  const operationConsumers = topology.cells
    .filter(
      (candidate) =>
        candidate.manifest.id !== operationId &&
        candidate.manifest.consumes.some((event) => emitted.has(event.id)),
    )
    .map((candidate) => `${candidate.manifest.id} (operation)`);
  const consumerDescriptions = [
    ...consumers.map((consumer) => `${consumer} (experience)`),
    ...operationConsumers,
  ].sort();

  return Object.freeze({
    kind: 'found',
    explanation: Object.freeze({
      operationId,
      kind: compiled.manifest.kind,
      authentication: compiled.manifest.authentication,
      owner: `${compiled.ownerKind}:${compiled.ownerId}`,
      source: `${compiled.source.moduleSpecifier}#${compiled.source.manifestExportName} -> ${compiled.source.assemblyExportName}().cells[${JSON.stringify(compiled.source.assemblyKey)}]`,
      paths: operationPaths[operationId] ?? null,
      authorization:
        compiled.manifest.authorization === null
          ? null
          : `${compiled.manifest.authorization.capability} (${compiled.manifest.authorization.timing})`,
      consistency: Object.freeze(consistency),
      consumers: Object.freeze(consumerDescriptions),
      contextRequirements: Object.freeze(
        [
          ...new Set(
            compiled.manifest.surfaces.flatMap((surface) =>
              surface.kind === 'cli' || surface.kind === 'http'
                ? surface.contextRequirements
                : [],
            ),
          ),
        ].sort(),
      ),
      cli: Object.freeze(
        compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'cli'
            ? [`${surface.name.join(' ')} (${surface.id})`]
            : [],
        ),
      ),
      eventStreams: Object.freeze(
        compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'event-stream'
            ? [
                `${surface.method} ${surface.path} (retry ${surface.retryMs}ms; events: ${surface.eventTypes.join(', ')})`,
              ]
            : [],
        ),
      ),
      http: Object.freeze(
        compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'http' ? [`${surface.method} ${surface.path}`] : [],
        ),
      ),
      jobs: Object.freeze(
        compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'job' ? [`${surface.id} (${surface.trigger})`] : [],
        ),
      ),
      protocols: Object.freeze(
        compiled.manifest.surfaces
          .flatMap((surface) => {
            switch (surface.kind) {
              case 'cli':
                return [`cli: ${surface.name.join(' ')} (${surface.id})`];
              case 'event-stream':
                return [`event-stream: ${surface.method} ${surface.path}`];
              case 'http':
                return [`http: ${surface.method} ${surface.path}`];
              case 'job':
                return [`job: ${surface.id} (${surface.trigger})`];
            }
          })
          .sort(),
      ),
      emits: Object.freeze(compiled.manifest.emits.map((event) => event.id)),
      consumes: Object.freeze(
        compiled.manifest.consumes.map((event) => event.id),
      ),
      experienceConsumers: Object.freeze(consumers),
      experienceFeatures: Object.freeze([
        ...(operationPaths[operationId]?.features ?? []),
      ]),
      observability: compiled.manifest.observability.operation,
    }),
  });
};

const section = (name: string, values: readonly string[]): readonly string[] =>
  values.length === 0
    ? Object.freeze([name, '  -'])
    : Object.freeze([name, ...values.map((value) => `  ${value}`)]);

export const formatArchitectureExplanation = (
  explanation: ArchitectureExplanation,
): string =>
  [
    'Operation',
    `  ${explanation.operationId}`,
    '',
    'Kind',
    `  ${explanation.kind}`,
    '',
    'Authentication',
    `  ${explanation.authentication}`,
    '',
    'Owner',
    `  ${explanation.owner}`,
    '',
    'Source',
    `  ${explanation.source}`,
    '',
    ...section(
      'Repository paths',
      explanation.paths === null
        ? []
        : [
            `cell: ${explanation.paths.cell}`,
            ...explanation.paths.contracts.map((value) => `contract: ${value}`),
            ...explanation.paths.decisions.map((value) => `decision: ${value}`),
            ...explanation.paths.executors.map((value) => `executor: ${value}`),
            ...explanation.paths.persistence.map(
              (value) => `persistence: ${value}`,
            ),
            ...explanation.paths.protocols.map((value) => `protocol: ${value}`),
            ...explanation.paths.tests.map((value) => `test: ${value}`),
          ],
    ),
    '',
    ...section(
      'Authorization',
      explanation.authorization === null ? [] : [explanation.authorization],
    ),
    '',
    ...section('Consistency', explanation.consistency),
    '',
    ...section('Consumers', explanation.consumers),
    '',
    ...section('Protocols', explanation.protocols),
    '',
    ...section('State paths', explanation.paths?.state ?? []),
    '',
    ...section('Event paths', explanation.paths?.events ?? []),
    '',
    ...section('Context requirements', explanation.contextRequirements),
    '',
    ...section('CLI', explanation.cli),
    '',
    ...section('Event streams', explanation.eventStreams),
    '',
    ...section('HTTP', explanation.http),
    '',
    ...section('Jobs', explanation.jobs),
    '',
    ...section('Emits', explanation.emits),
    '',
    ...section('Consumes', explanation.consumes),
    '',
    ...section('Experience consumers', explanation.experienceConsumers),
    '',
    ...section(
      'Experience features',
      explanation.experienceFeatures.flatMap((feature) => [
        `${feature.id} (${feature.experience})`,
        `  declaration: ${feature.path}`,
        ...feature.stateProofs.map((proof) => `  state proof: ${proof}`),
        ...feature.componentProofs.map(
          (proof) => `  component proof: ${proof}`,
        ),
      ]),
    ),
    '',
    'Observability',
    `  ${explanation.observability}`,
  ].join('\n');
