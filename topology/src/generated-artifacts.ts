import type {
  CliProgramManifest,
  HttpBoundaryProfile,
  StaticArchitectureMap,
  StaticArchitectureOperation,
  StaticArchitecturePaths,
} from '@pressly/cells';
import { ingressMetricDescriptors } from '@pressly/ingress-system/observability/metrics';
import { genericMetricDescriptors } from '@pressly/observability';
import {
  composeMetricCatalog,
  type CatalogMetricDefinition,
  type CatalogMetricDescriptor,
} from '@pressly/observability/metric-catalog-algebra';
import { productionMetricDescriptors } from '@pressly/production-system/observability/metrics';
import type { CompiledCell, CompiledTopology } from './compiler.ts';
import { selectClientHttpSurfaces } from './client-http-surfaces.ts';
import {
  controlBrowserRuntimeTemplate,
  customerBrowserRuntimeTemplate,
  customerClientBrowserRuntimeTemplate,
  processorBrowserRuntimeTemplate,
} from './browser-runtime-templates.ts';

export type GeneratedArtifactPath =
  | 'generated/architecture-map.ts'
  | `generated/clients/${string}.ts`
  | 'generated/cli-catalog.ts'
  | 'generated/event-stream-catalog.ts'
  | 'generated/http-catalog.ts'
  | 'generated/job-catalog.ts'
  | 'generated/observability-catalog.ts'
  | 'generated/runtime/src/http.ts'
  | 'generated/runtime/src/jobs.ts'
  | 'generated/runtime/src/cli.ts'
  | 'generated/runtime/src/browser/control.ts'
  | 'generated/runtime/src/browser/customer.ts'
  | 'generated/runtime/src/browser/customer-client.ts'
  | 'generated/runtime/src/browser/processor.ts';

export type GeneratedArtifact = Readonly<{
  path: GeneratedArtifactPath;
  content: string;
}>;

export type GeneratedArtifactMismatch = Readonly<{
  path: string;
  reason: 'missing' | 'stale' | 'unexpected';
}>;

const header = `/* This file is generated from the checked deployment topology. */\n`;

type MetricDescriptor = CatalogMetricDescriptor<string, string>;

export type ObservabilityCatalogViolationCode =
  | 'duplicate_job_id'
  | 'duplicate_job_label'
  | 'duplicate_metric_name'
  | 'duplicate_observability_name'
  | 'duplicate_operation_id';

export type ObservabilityCatalogViolation = Readonly<{
  code: ObservabilityCatalogViolationCode;
  subject: string;
  message: string;
}>;

type ObservabilityOperation = Readonly<{
  id: string;
  name: string;
}>;

type ObservabilityJob = Readonly<{
  id: string;
  operationId: string;
  operation: string;
  queue: string | null;
}>;

export type ObservabilityCatalogResolution =
  | Readonly<{
      kind: 'ready';
      catalog: Readonly<Record<string, CatalogMetricDefinition>>;
      operations: readonly ObservabilityOperation[];
      jobs: readonly ObservabilityJob[];
    }>
  | Readonly<{
      kind: 'invalid';
      violations: readonly ObservabilityCatalogViolation[];
    }>;

const runtimeValues = Object.freeze([
  'api',
  'worker',
  'web',
  'processor',
  'control',
]);

const duplicateValues = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values)
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  return Object.freeze([...duplicates].sort());
};

const catalogViolation = (
  code: ObservabilityCatalogViolationCode,
  subject: string,
  message: string,
): ObservabilityCatalogViolation => Object.freeze({ code, subject, message });

const invalidObservabilityCatalog = (
  violations: ObservabilityCatalogViolation[],
): ObservabilityCatalogResolution =>
  Object.freeze({
    kind: 'invalid',
    violations: Object.freeze(
      violations.sort((left, right) =>
        left.code === right.code
          ? left.subject < right.subject
            ? -1
            : left.subject > right.subject
              ? 1
              : 0
          : left.code < right.code
            ? -1
            : 1,
      ),
    ),
  });

const transactionMetricNames = new Set([
  'db.transactions',
  'db.transaction_duration_seconds',
]);

const enrichMetricDescriptor = (
  descriptor: MetricDescriptor,
  operationIds: readonly string[],
  operationNames: readonly string[],
): MetricDescriptor => {
  const topologyAware =
    descriptor.allowedAttributes.includes('operation') ||
    descriptor.allowedAttributes.includes('job');
  const allowedAttributes = Object.freeze([
    ...descriptor.allowedAttributes,
    ...(topologyAware && !descriptor.allowedAttributes.includes('operation_id')
      ? ['operation_id']
      : []),
  ]);
  const attributeValues = Object.fromEntries(
    Object.entries(descriptor.attributeValues ?? {}).flatMap(
      ([name, values]) => (values === undefined ? [] : [[name, values]]),
    ),
  ) as Record<string, readonly string[]>;

  if (allowedAttributes.includes('runtime'))
    attributeValues['runtime'] = runtimeValues;
  if (
    transactionMetricNames.has(descriptor.name) &&
    allowedAttributes.includes('operation')
  )
    attributeValues['operation'] = operationNames;
  if (allowedAttributes.includes('operation_id'))
    attributeValues['operation_id'] = operationIds;

  return Object.freeze({
    ...descriptor,
    allowedAttributes,
    attributeValues: Object.freeze(attributeValues),
  });
};

export const resolveObservabilityCatalog = (
  topology: CompiledTopology,
  descriptorCollections: readonly (readonly MetricDescriptor[])[] = [
    genericMetricDescriptors,
    productionMetricDescriptors,
    ingressMetricDescriptors,
  ],
): ObservabilityCatalogResolution => {
  const operations = Object.freeze(
    topology.cells
      .map((cell) =>
        Object.freeze({
          id: cell.manifest.id,
          name: cell.manifest.observability.operation,
        }),
      )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
  );
  const operationById = new Map(
    operations.map((operation) => [operation.id, operation]),
  );
  const jobs = Object.freeze(
    topology.jobs
      .map((job) =>
        Object.freeze({
          id: job.surface.id,
          operationId: job.operationId,
          operation:
            operationById.get(job.operationId)?.name ?? job.operationId,
          queue: job.surface.queue,
        }),
      )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
  );
  const operationIds = Object.freeze(operations.map(({ id }) => id));
  const operationNames = Object.freeze(operations.map(({ name }) => name));
  const violations: ObservabilityCatalogViolation[] = [];

  for (const id of duplicateValues(operationIds))
    violations.push(
      catalogViolation(
        'duplicate_operation_id',
        id,
        `Observability operation id "${id}" is declared more than once.`,
      ),
    );
  for (const name of duplicateValues(operationNames))
    violations.push(
      catalogViolation(
        'duplicate_observability_name',
        name,
        `Observability operation name "${name}" is declared more than once.`,
      ),
    );
  for (const id of duplicateValues(jobs.map((job) => job.id)))
    violations.push(
      catalogViolation(
        'duplicate_job_id',
        id,
        `Observability job id "${id}" is declared more than once.`,
      ),
    );
  for (const label of duplicateValues(jobs.flatMap((job) => job.queue ?? [])))
    violations.push(
      catalogViolation(
        'duplicate_job_label',
        label,
        `Observability job label "${label}" is declared by more than one job surface.`,
      ),
    );

  const enrichedCollections = descriptorCollections.map((collection) =>
    collection.map((descriptor) =>
      enrichMetricDescriptor(descriptor, operationIds, operationNames),
    ),
  );
  const composition = composeMetricCatalog(...enrichedCollections);
  if (composition.kind === 'collision') {
    for (const name of composition.duplicateNames)
      violations.push(
        catalogViolation(
          'duplicate_metric_name',
          name,
          `Metric name "${name}" is declared by more than one owner.`,
        ),
      );
    return invalidObservabilityCatalog(violations);
  }

  if (violations.length > 0) return invalidObservabilityCatalog(violations);

  return Object.freeze({
    kind: 'ready',
    catalog: composition.catalog,
    operations,
    jobs,
  });
};

const renderFrozenConst = (name: string, value: unknown): string =>
  `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)} as const);`;

const renderMetricCatalog = (
  catalog: Readonly<Record<string, CatalogMetricDefinition>>,
): string => {
  const entries = Object.entries(catalog).map(([name, definition]) => {
    const serialized = JSON.stringify(
      definition,
      (key, value: unknown) => {
        if (key === 'runtime') return '__OBSERVABILITY_RUNTIME_VALUES__';
        if (key === 'operation_id') return '__OBSERVABILITY_OPERATION_IDS__';
        if (key === 'operation' && transactionMetricNames.has(name))
          return '__OBSERVABILITY_OPERATION_NAMES__';
        return value;
      },
      2,
    )
      .replaceAll(
        '"__OBSERVABILITY_RUNTIME_VALUES__"',
        'observabilityRuntimeValues',
      )
      .replaceAll(
        '"__OBSERVABILITY_OPERATION_IDS__"',
        'observabilityOperationIds',
      )
      .replaceAll(
        '"__OBSERVABILITY_OPERATION_NAMES__"',
        'observabilityOperationNames',
      );
    return `${JSON.stringify(name)}: ${serialized}`;
  });

  return `export const metricCatalog = Object.freeze({\n${entries.join(',\n')}\n} as const);`;
};

const renderObservabilityCatalog = (
  resolution: Extract<ObservabilityCatalogResolution, { kind: 'ready' }>,
): string => {
  const operationIds = resolution.operations.map(({ id }) => id);
  const operationNames = resolution.operations.map(({ name }) => name);
  const operationIdByName = Object.fromEntries(
    resolution.operations.map(({ id, name }) => [name, id]),
  );
  const operationsById = Object.fromEntries(
    resolution.operations.map(({ id, name }) => [id, { operation: name }]),
  );
  const jobsById = Object.fromEntries(
    resolution.jobs.map(({ id, operationId, operation, queue }) => [
      id,
      { operationId, operation, queue },
    ]),
  );
  const operationIdByJobLabel = Object.fromEntries(
    resolution.jobs.flatMap(({ operationId, queue }) =>
      queue === null ? [] : [[queue, operationId]],
    ),
  );
  const metricAttributeKeys = Object.freeze(
    [
      ...new Set(
        Object.values(resolution.catalog).flatMap(
          (definition) => definition.allowedAttributes,
        ),
      ),
    ].sort(),
  );

  return `${header}${renderFrozenConst('observabilityOperationIds', operationIds)}

${renderFrozenConst('observabilityOperationNames', operationNames)}

${renderFrozenConst('observabilityRuntimeValues', runtimeValues)}

${renderFrozenConst('observabilityOperationIdByName', operationIdByName)}

${renderFrozenConst('observabilityOperationsById', operationsById)}

${renderFrozenConst('observabilityJobsById', jobsById)}

${renderFrozenConst('observabilityOperationIdByJobLabel', operationIdByJobLabel)}

${renderFrozenConst('metricAttributeKeys', metricAttributeKeys)}

${renderMetricCatalog(resolution.catalog)}

export type ObservabilityOperationId =
  (typeof observabilityOperationIds)[number];
export type ObservabilityOperationName =
  (typeof observabilityOperationNames)[number];
export type ObservabilityJobId = keyof typeof observabilityJobsById;
export type ObservabilityJobLabel =
  keyof typeof observabilityOperationIdByJobLabel;
export type MetricName = keyof typeof metricCatalog;
export type MetricAttributeKey = (typeof metricAttributeKeys)[number];
export type MetricDefinition = (typeof metricCatalog)[MetricName];
export type MetricInstrument = MetricDefinition['instrument'];
export type MetricUnit = MetricDefinition['unit'];
export type CounterName = {
  [Name in MetricName]: (typeof metricCatalog)[Name]['instrument'] extends 'counter'
    ? Name
    : never;
}[MetricName];
export type MeasurementName = Exclude<MetricName, CounterName>;

export const isMetricName = (name: string): name is MetricName =>
  Object.hasOwn(metricCatalog, name);

export const observabilityOperationIdFor = (
  operation: string,
): ObservabilityOperationId | undefined =>
  Object.hasOwn(observabilityOperationIdByName, operation)
    ? (
        observabilityOperationIdByName as Readonly<
          Record<string, ObservabilityOperationId>
        >
      )[operation]
    : undefined;

export const observabilityOperationIdForJobLabel = (
  job: string,
): ObservabilityOperationId | undefined =>
  Object.hasOwn(observabilityOperationIdByJobLabel, job)
    ? (
        observabilityOperationIdByJobLabel as Readonly<
          Record<string, ObservabilityOperationId>
        >
      )[job]
    : undefined;
`;
};

const renderNamedImports = (
  imports: readonly Readonly<{
    moduleSpecifier: string;
    exportName: string;
    alias: string;
  }>[],
): string => {
  const byModule = new Map<
    string,
    readonly Readonly<{ exportName: string; alias: string }>[]
  >();
  for (const imported of imports) {
    const current = byModule.get(imported.moduleSpecifier) ?? [];
    byModule.set(
      imported.moduleSpecifier,
      Object.freeze([
        ...current,
        Object.freeze({
          exportName: imported.exportName,
          alias: imported.alias,
        }),
      ]),
    );
  }

  return [...byModule]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([moduleSpecifier, moduleImports]) => {
      const specifiers = [...moduleImports]
        .sort((left, right) =>
          left.alias < right.alias ? -1 : left.alias > right.alias ? 1 : 0,
        )
        .map(({ exportName, alias }) => `${exportName} as ${alias}`)
        .join(', ');
      return `import { ${specifiers} } from ${JSON.stringify(moduleSpecifier)};`;
    })
    .join('\n');
};

type OwnerAssembly = Readonly<{
  ownerKey: string;
  factoryAlias: string;
  instanceAlias: string;
  moduleSpecifier: string;
  exportName: string;
}>;

const ownerKey = (cell: CompiledCell): string =>
  `${cell.ownerKind}:${cell.ownerId}`;

const ownerAssemblies = (
  cells: readonly CompiledCell[],
): readonly OwnerAssembly[] => {
  const firstByOwner = new Map<string, CompiledCell>();
  for (const cell of cells)
    if (!firstByOwner.has(ownerKey(cell)))
      firstByOwner.set(ownerKey(cell), cell);

  return Object.freeze(
    [...firstByOwner]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, cell], index) =>
        Object.freeze({
          ownerKey: key,
          factoryAlias: `assemble${index}`,
          instanceAlias: `owner${index}`,
          moduleSpecifier: cell.source.moduleSpecifier,
          exportName: cell.source.assemblyExportName,
        }),
      ),
  );
};

const renderCatalog = (
  helper:
    | 'defineCliCatalog'
    | 'defineEventStreamCatalog'
    | 'defineHttpCatalog'
    | 'defineJobCatalog',
  factoryName:
    | 'makeCliCatalog'
    | 'makeEventStreamCatalog'
    | 'makeHttpCatalog'
    | 'makeJobCatalog',
  ownersFactoryName:
    | 'makeCliCatalogFromOwners'
    | 'makeEventStreamCatalogFromOwners'
    | 'makeHttpCatalogFromOwners'
    | 'makeJobCatalogFromOwners',
  ownersName:
    | 'CliCatalogOwners'
    | 'EventStreamCatalogOwners'
    | 'HttpCatalogOwners'
    | 'JobCatalogOwners',
  dependenciesName:
    | 'CliCatalogDependencies'
    | 'EventStreamCatalogDependencies'
    | 'HttpCatalogDependencies'
    | 'JobCatalogDependencies',
  cells: readonly CompiledCell[],
  boundaryProfilesByOperation: readonly Readonly<{
    operationId: string;
    profile: HttpBoundaryProfile;
  }>[] = [],
  cliProgram: CliProgramManifest | null = null,
): string => {
  const catalogType =
    helper === 'defineCliCatalog'
      ? 'ExecutableCliCatalog'
      : helper === 'defineHttpCatalog'
        ? 'ExecutableHttpCatalog'
        : helper === 'defineJobCatalog'
          ? 'ExecutableJobCatalog'
          : 'ExecutableEventStreamCatalog';
  const assemblies = ownerAssemblies(cells);
  const imports = renderNamedImports(
    assemblies.map((assembly) => ({
      moduleSpecifier: assembly.moduleSpecifier,
      exportName: assembly.exportName,
      alias: assembly.factoryAlias,
    })),
  );
  const assemblyByOwner = new Map(
    assemblies.map((assembly) => [assembly.ownerKey, assembly]),
  );
  const dependencyFields = assemblies
    .map(
      (assembly) =>
        `  ${JSON.stringify(assembly.ownerKey)}: Parameters<typeof ${assembly.factoryAlias}>;`,
    )
    .join('\n');
  const ownerFields = assemblies
    .map(
      (assembly) =>
        `  ${JSON.stringify(assembly.ownerKey)}: Awaited<ReturnType<typeof ${assembly.factoryAlias}>>;`,
    )
    .join('\n');
  const assemblyStatements = assemblies
    .map(
      (assembly) =>
        `  const ${assembly.instanceAlias} = await ${assembly.factoryAlias}(...dependencies[${JSON.stringify(assembly.ownerKey)}]);`,
    )
    .join('\n');
  const assembledOwners = assemblies
    .map(
      (assembly) =>
        `    ${JSON.stringify(assembly.ownerKey)}: ${assembly.instanceAlias},`,
    )
    .join('\n');
  const values = cells
    .map((cell) => {
      const assembly = assemblyByOwner.get(ownerKey(cell));
      return `    owners[${JSON.stringify(assembly?.ownerKey ?? ownerKey(cell))}].cells[${JSON.stringify(cell.source.assemblyKey)}],`;
    })
    .join('\n');
  const cellImports = imports.length === 0 ? '' : `${imports}\n`;
  const array =
    values.length === 0 ? '[] as const' : `[\n${values}\n] as const`;
  const dependencies =
    dependencyFields.length === 0
      ? 'Readonly<Record<never, never>>'
      : `Readonly<{\n${dependencyFields}\n}>`;
  const owners =
    ownerFields.length === 0
      ? 'Readonly<Record<never, never>>'
      : `Readonly<{\n${ownerFields}\n}>`;
  const boundaryProfileArgument =
    boundaryProfilesByOperation.length === 0
      ? ''
      : `, ${JSON.stringify(
          Object.fromEntries(
            boundaryProfilesByOperation.map(({ operationId, profile }) => [
              operationId,
              profile,
            ]),
          ),
          null,
          2,
        )} as const`;
  const cliProgramArgument =
    helper !== 'defineCliCatalog' || cliProgram === null
      ? ''
      : `, ${JSON.stringify(cliProgram, null, 2)} as const`;
  const catalogArgument = `${boundaryProfileArgument}${cliProgramArgument}`;
  const fromOwners = `export const ${ownersFactoryName} = (\n  ${values.length === 0 ? '_owners' : 'owners'}: ${ownersName},\n): ${catalogType} =>\n  ${helper}(${array}${catalogArgument});`;
  const implementation =
    assemblyStatements.length === 0
      ? `export const ${factoryName} = async (\n  _dependencies: ${dependenciesName},\n): Promise<${catalogType}> =>\n  ${ownersFactoryName}({});`
      : `export const ${factoryName} = async (\n  dependencies: ${dependenciesName},\n): Promise<${catalogType}> => {\n${assemblyStatements}\n\n  return ${ownersFactoryName}({\n${assembledOwners}\n  });\n};`;

  return `${header}import { ${helper}, type ${catalogType} } from '@pressly/cells';\n${cellImports}\nexport type ${ownersName} = ${owners};\n\nexport type ${dependenciesName} = ${dependencies};\n\n${fromOwners}\n\n${implementation}\n`;
};

const httpCells = (topology: CompiledTopology): readonly CompiledCell[] =>
  Object.freeze(
    topology.cells.filter((compiled) =>
      compiled.manifest.surfaces.some((surface) => surface.kind === 'http'),
    ),
  );

const cliCells = (topology: CompiledTopology): readonly CompiledCell[] =>
  Object.freeze(
    topology.cells.filter((compiled) =>
      compiled.manifest.surfaces.some((surface) => surface.kind === 'cli'),
    ),
  );

const httpBoundaryProfilesByOperation = (
  topology: CompiledTopology,
): readonly Readonly<{
  operationId: string;
  profile: HttpBoundaryProfile;
}>[] => {
  const profiles = new Map<string, HttpBoundaryProfile>();
  for (const route of topology.httpRoutes)
    if (route.boundaryProfile !== null)
      profiles.set(route.operationId, route.boundaryProfile);

  return Object.freeze(
    [...profiles]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([operationId, profile]) => Object.freeze({ operationId, profile })),
  );
};

const httpBoundaryProviderTokens = (
  topology: CompiledTopology,
): Readonly<{
  middleware: readonly string[];
  context: readonly string[];
  authorization: readonly string[];
  expectedFailure: readonly string[];
}> => {
  const middleware = new Set<string>();
  const context = new Set<string>();
  const authorization = new Set<string>();
  const expectedFailure = new Set<string>();

  for (const route of topology.httpRoutes) {
    const profile = route.boundaryProfile;
    if (profile === null) continue;
    if (profile.authentication !== null)
      middleware.add(profile.authentication.provider);
    if (profile.requestBody !== null)
      middleware.add(profile.requestBody.parser);
    if (profile.exactOrigin !== null) middleware.add(profile.exactOrigin);
    if (profile.csrf !== null) middleware.add(profile.csrf);
    if (profile.requestRateLimit !== null)
      middleware.add(profile.requestRateLimit);
    if (profile.identityRateLimit !== null)
      middleware.add(profile.identityRateLimit);
    for (const provider of profile.contextProviders) context.add(provider);
    if (profile.authorization !== null)
      authorization.add(profile.authorization);
    const failureObservation = profile.expectedFailureObservation ?? null;
    if (failureObservation !== null) expectedFailure.add(failureObservation);
  }

  return Object.freeze({
    middleware: Object.freeze([...middleware].sort()),
    context: Object.freeze([...context].sort()),
    authorization: Object.freeze([...authorization].sort()),
    expectedFailure: Object.freeze([...expectedFailure].sort()),
  });
};

const renderHttpBoundaryProviderCatalog = (
  topology: CompiledTopology,
): string =>
  `${renderFrozenConst(
    'httpBoundaryProviderTokens',
    httpBoundaryProviderTokens(topology),
  )}\n`;

const renderHttpRouteManifest = (topology: CompiledTopology): string =>
  `${renderFrozenConst(
    'httpRouteManifest',
    topology.httpRoutes.map((route) => ({
      operationId: route.operationId,
      method: route.surface.method,
      path: route.surface.path,
    })),
  )}\n`;

const jobCells = (topology: CompiledTopology): readonly CompiledCell[] =>
  Object.freeze(
    topology.cells.filter((compiled) =>
      compiled.manifest.surfaces.some((surface) => surface.kind === 'job'),
    ),
  );

const eventStreamCells = (
  topology: CompiledTopology,
): readonly CompiledCell[] =>
  Object.freeze(
    topology.cells.filter((compiled) =>
      compiled.manifest.surfaces.some(
        (surface) => surface.kind === 'event-stream',
      ),
    ),
  );

const clientCells = (topology: CompiledTopology): readonly CompiledCell[] =>
  Object.freeze(
    topology.cells.filter((compiled) =>
      compiled.manifest.surfaces.some(
        (surface) => surface.kind === 'event-stream' || surface.kind === 'http',
      ),
    ),
  );

const toIdentifier = (value: string): string => {
  const words = value.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  return words
    .map((word, index) =>
      index === 0 ? word : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`,
    )
    .join('');
};

const renderClientOperation = (cell: CompiledCell): string => {
  const operationName = toIdentifier(cell.manifest.id);
  const selection = selectClientHttpSurfaces(
    cell.manifest.surfaces.filter(
      (
        surface,
      ): surface is Extract<
        (typeof cell.manifest.surfaces)[number],
        { kind: 'http' }
      > => surface.kind === 'http',
    ),
  );
  const surfaces =
    selection.kind === 'selected'
      ? selection.surfaces
          .map(
            ({ key, surface }) =>
              `    ${JSON.stringify(key)}: { method: ${JSON.stringify(surface.method)}, path: ${JSON.stringify(surface.path)} },`,
          )
          .join('\n')
      : '';
  const eventStreamSurface = cell.manifest.surfaces.find(
    (surface) => surface.kind === 'event-stream',
  );
  const eventVersion =
    cell.manifest.kind === 'subscription' && 'event' in cell.manifest.contract
      ? `\n    eventVersion: ${String(cell.manifest.contract.event.version)},`
      : '';
  const eventStream =
    eventStreamSurface === undefined
      ? ''
      : `\n  eventStream: {\n    method: ${JSON.stringify(eventStreamSurface.method)},\n    path: ${JSON.stringify(eventStreamSurface.path)},\n    retryMs: ${eventStreamSurface.retryMs},\n    eventTypes: ${JSON.stringify(eventStreamSurface.eventTypes)},\n  },`;

  return `export const ${operationName} = {
  operationId: ${JSON.stringify(cell.manifest.id)},
  contract: {
    inputVersion: ${cell.manifest.contract.input.version},
    outputVersion: ${cell.manifest.contract.output.version},
    failureVersion: ${cell.manifest.contract.failure.version},${eventVersion}
  },${eventStream}
  http: {
${surfaces}
  },
} as const;`;
};

const renderExperienceClient = (
  topology: CompiledTopology,
  experience: CompiledTopology['experiences'][number],
): string => {
  const byOperationId = new Map(
    clientCells(topology).map((compiled) => [compiled.manifest.id, compiled]),
  );
  const selectedCells = experience.clientOperationIds.flatMap((operationId) => {
    const cell = byOperationId.get(operationId);
    return cell === undefined ? [] : [cell];
  });
  const declarations = selectedCells.map(renderClientOperation).join('\n\n');
  const operationEntries = selectedCells
    .map(
      (cell) =>
        `    ${JSON.stringify(cell.manifest.id)}: ${toIdentifier(cell.manifest.id)},`,
    )
    .join('\n');
  const clientName = `${toIdentifier(experience.id)}Client`;

  return `${header}${declarations.length === 0 ? '' : `${declarations}\n\n`}export const ${clientName} = {
  experienceId: ${JSON.stringify(experience.id)},
  operations: {
${operationEntries}
  },
} as const;
`;
};

const renderExperienceClients = (
  topology: CompiledTopology,
): readonly GeneratedArtifact[] =>
  Object.freeze(
    topology.experiences.map((experience) =>
      Object.freeze({
        path: `generated/clients/${experience.id}.ts` as const,
        content: renderExperienceClient(topology, experience),
      }),
    ),
  );

const architectureMapFor = (
  topology: CompiledTopology,
  operationPaths: Readonly<Record<string, StaticArchitecturePaths>>,
): StaticArchitectureMap => {
  const consumersByOperation = new Map<string, string[]>();
  for (const experience of topology.experiences)
    for (const operationId of experience.operationIds) {
      const consumers = consumersByOperation.get(operationId) ?? [];
      consumers.push(experience.id);
      consumersByOperation.set(operationId, consumers);
    }

  const boundaryProfileByOperation = new Map(
    topology.httpRoutes.flatMap((route) =>
      route.boundaryProfile === null
        ? []
        : [[route.operationId, route.boundaryProfile.id] as const],
    ),
  );

  const operations: StaticArchitectureOperation[] = topology.cells.map(
    (compiled) => {
      const boundaryProfile = boundaryProfileByOperation.get(
        compiled.manifest.id,
      );
      return {
        id: compiled.manifest.id,
        kind: compiled.manifest.kind,
        authentication: compiled.manifest.authentication,
        owner: compiled.ownerId,
        ownerKind: compiled.ownerKind,
        source: compiled.source,
        paths: operationPaths[compiled.manifest.id] ?? null,
        authorization: compiled.manifest.authorization,
        consistency: {
          transaction: compiled.manifest.consistency.transaction,
          concurrency: compiled.manifest.consistency.concurrency,
          idempotencyRequired: compiled.manifest.idempotency.required,
        },
        cli: compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'cli' ? [surface] : [],
        ),
        http: compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'http'
            ? [
                {
                  method: surface.method,
                  path: surface.path,
                  contextRequirements: surface.contextRequirements,
                  ...(boundaryProfile === undefined ? {} : { boundaryProfile }),
                },
              ]
            : [],
        ),
        jobs: compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'job'
            ? [{ id: surface.id, trigger: surface.trigger }]
            : [],
        ),
        eventStreams: compiled.manifest.surfaces.flatMap((surface) =>
          surface.kind === 'event-stream'
            ? [
                {
                  method: surface.method,
                  path: surface.path,
                  retryMs: surface.retryMs,
                  eventTypes: surface.eventTypes,
                },
              ]
            : [],
        ),
        emits: compiled.manifest.emits.map((event) => event.id),
        consumes: compiled.manifest.consumes.map((event) => event.id),
        experienceConsumers: Object.freeze(
          [...(consumersByOperation.get(compiled.manifest.id) ?? [])].sort(),
        ),
        observability: compiled.manifest.observability.operation,
      };
    },
  );

  const features = topology.experiences.flatMap((experience) =>
    experience.features.map((feature) =>
      Object.freeze({
        id: feature.id,
        experience: experience.id,
        path: feature.source.repositoryPath,
        uses: feature.operationIds,
        stateProofs: feature.stateProofs,
        componentProofs: feature.componentProofs,
      }),
    ),
  );

  return Object.freeze({
    topologyId: topology.id,
    features: Object.freeze(features),
    operations,
  });
};

const renderArchitectureMap = (
  topology: CompiledTopology,
  operationPaths: Readonly<Record<string, StaticArchitecturePaths>>,
): string => {
  const serialized = JSON.stringify(
    architectureMapFor(topology, operationPaths),
    null,
    2,
  )
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `${header}import { defineArchitectureMap } from '@pressly/cells';\n\nexport const architectureMap = defineArchitectureMap(\n${serialized} as const,\n);\n`;
};

const renderHttpRuntime =
  (): string => `${header}import { makeEventStreamCatalogFromOwners } from '@pressly/generated/event-stream-catalog';
import { makeHttpCatalogFromOwners } from '@pressly/generated/http-catalog';
import { createPostgresRuntime } from '@pressly/postgres/client';
import {
  composePresslyHttpRuntime,
  parseApiEnv,
  type ApiBoundaryRequest,
  type ApiBoundaryResponse,
  type PresslyHttpRuntimeAssembly,
  type PresslyHttpRuntimeInput,
} from '@pressly/topology/runtime/http';
import { presslyPostgresSchema } from '@pressly/topology/postgres-schema';

export const parseHttpRuntimeConfiguration = (environment: NodeJS.ProcessEnv) =>
  parseApiEnv(environment);

export const createHttpDatabase = (input: {
  databaseUrl: string;
  maxConnections: number;
}) =>
  createPostgresRuntime({
    databaseUrl: input.databaseUrl,
    schema: presslyPostgresSchema,
    maxConnections: input.maxConnections,
    connectTimeoutSeconds: 5,
    idleTimeoutSeconds: 30,
    maxLifetimeSeconds: 60 * 30,
  });

export const composeHttpRuntime = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  input: Omit<PresslyHttpRuntimeInput<Request, Response>, 'catalogs'>,
): PresslyHttpRuntimeAssembly<Request, Response> =>
  composePresslyHttpRuntime({
    ...input,
    catalogs: {
      makeEventStreamCatalog: makeEventStreamCatalogFromOwners,
      makeHttpCatalog: makeHttpCatalogFromOwners,
    },
  });
`;

const renderJobsRuntime =
  (): string => `${header}import { makeJobCatalogFromOwners } from '@pressly/generated/job-catalog';
import { composePresslyJobsRuntime } from '@pressly/topology/runtime/jobs';

export const composeJobsRuntime = (
  input: Parameters<typeof composePresslyJobsRuntime>[0],
) => composePresslyJobsRuntime(input, makeJobCatalogFromOwners);
`;

const renderCliRuntime =
  (): string => `${header}import { makeCliCatalogFromOwners } from '@pressly/generated/cli-catalog';
import { createPostgresRuntime } from '@pressly/postgres/client';
import {
  composePresslyCliRuntime,
  resolvePresslyCliRuntimeInvocation,
} from '@pressly/topology/runtime/cli';
import { presslyPostgresSchema } from '@pressly/topology/postgres-schema';

export const resolveCliRuntimeInvocation = (argv: readonly string[]) =>
  resolvePresslyCliRuntimeInvocation(argv);

export const composeCliRuntime = (
  input: Parameters<typeof composePresslyCliRuntime>[0],
) => composePresslyCliRuntime(input, makeCliCatalogFromOwners);

export const createCliDatabase = (input: {
  databaseUrl: string;
  maxConnections: number;
}) =>
  createPostgresRuntime({
    databaseUrl: input.databaseUrl,
    schema: presslyPostgresSchema,
    maxConnections: input.maxConnections,
    connectTimeoutSeconds: 5,
    idleTimeoutSeconds: 30,
    maxLifetimeSeconds: 60 * 30,
  });
`;

const generateResolvedStaticArtifacts = (
  topology: CompiledTopology,
  observability: Extract<ObservabilityCatalogResolution, { kind: 'ready' }>,
  operationPaths: Readonly<Record<string, StaticArchitecturePaths>> = {},
): readonly GeneratedArtifact[] =>
  Object.freeze([
    Object.freeze({
      path: 'generated/architecture-map.ts' as const,
      content: renderArchitectureMap(topology, operationPaths),
    }),
    ...renderExperienceClients(topology),
    Object.freeze({
      path: 'generated/cli-catalog.ts' as const,
      content: renderCatalog(
        'defineCliCatalog',
        'makeCliCatalog',
        'makeCliCatalogFromOwners',
        'CliCatalogOwners',
        'CliCatalogDependencies',
        cliCells(topology),
        [],
        topology.cliProgram,
      ),
    }),
    Object.freeze({
      path: 'generated/event-stream-catalog.ts' as const,
      content: renderCatalog(
        'defineEventStreamCatalog',
        'makeEventStreamCatalog',
        'makeEventStreamCatalogFromOwners',
        'EventStreamCatalogOwners',
        'EventStreamCatalogDependencies',
        eventStreamCells(topology),
      ),
    }),
    Object.freeze({
      path: 'generated/http-catalog.ts' as const,
      content: `${renderCatalog(
        'defineHttpCatalog',
        'makeHttpCatalog',
        'makeHttpCatalogFromOwners',
        'HttpCatalogOwners',
        'HttpCatalogDependencies',
        httpCells(topology),
        httpBoundaryProfilesByOperation(topology),
      )}\n${renderHttpRouteManifest(topology)}\n${renderHttpBoundaryProviderCatalog(topology)}`,
    }),
    Object.freeze({
      path: 'generated/job-catalog.ts' as const,
      content: renderCatalog(
        'defineJobCatalog',
        'makeJobCatalog',
        'makeJobCatalogFromOwners',
        'JobCatalogOwners',
        'JobCatalogDependencies',
        jobCells(topology),
      ),
    }),
    Object.freeze({
      path: 'generated/observability-catalog.ts' as const,
      content: renderObservabilityCatalog(observability),
    }),
    Object.freeze({
      path: 'generated/runtime/src/http.ts' as const,
      content: renderHttpRuntime(),
    }),
    Object.freeze({
      path: 'generated/runtime/src/jobs.ts' as const,
      content: renderJobsRuntime(),
    }),
    Object.freeze({
      path: 'generated/runtime/src/cli.ts' as const,
      content: renderCliRuntime(),
    }),
    Object.freeze({
      path: 'generated/runtime/src/browser/control.ts' as const,
      content: controlBrowserRuntimeTemplate,
    }),
    Object.freeze({
      path: 'generated/runtime/src/browser/customer.ts' as const,
      content: customerBrowserRuntimeTemplate,
    }),
    Object.freeze({
      path: 'generated/runtime/src/browser/customer-client.ts' as const,
      content: customerClientBrowserRuntimeTemplate,
    }),
    Object.freeze({
      path: 'generated/runtime/src/browser/processor.ts' as const,
      content: processorBrowserRuntimeTemplate,
    }),
  ]);

export type GeneratedArtifactsResolution =
  | Readonly<{
      kind: 'ready';
      artifacts: readonly GeneratedArtifact[];
    }>
  | Readonly<{
      kind: 'invalid-observability';
      violations: readonly ObservabilityCatalogViolation[];
    }>;

export const resolveStaticArtifacts = (
  topology: CompiledTopology,
  operationPaths: Readonly<Record<string, StaticArchitecturePaths>> = {},
): GeneratedArtifactsResolution => {
  const observability = resolveObservabilityCatalog(topology);
  return observability.kind === 'invalid'
    ? Object.freeze({
        kind: 'invalid-observability',
        violations: observability.violations,
      })
    : Object.freeze({
        kind: 'ready',
        artifacts: generateResolvedStaticArtifacts(
          topology,
          observability,
          operationPaths,
        ),
      });
};

export const compareGeneratedArtifacts = (
  expected: readonly GeneratedArtifact[],
  current: Readonly<Record<string, string | undefined>>,
): readonly GeneratedArtifactMismatch[] => {
  const expectedByPath = new Map<string, string>(
    expected.map((artifact) => [artifact.path, artifact.content]),
  );
  const mismatches: GeneratedArtifactMismatch[] = [];

  for (const [path, content] of expectedByPath) {
    const actual = current[path];
    if (actual === undefined)
      mismatches.push(Object.freeze({ path, reason: 'missing' }));
    else if (actual !== content)
      mismatches.push(Object.freeze({ path, reason: 'stale' }));
  }
  for (const path of Object.keys(current))
    if (!expectedByPath.has(path))
      mismatches.push(Object.freeze({ path, reason: 'unexpected' }));

  return Object.freeze(
    mismatches.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
  );
};
