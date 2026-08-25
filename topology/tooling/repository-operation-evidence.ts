import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type {
  StaticArchitectureFeature,
  StaticArchitecturePaths,
} from '@pressly/cells';
import ts from 'typescript';
import type { CompiledTopology, TopologyViolation } from '../src/public.ts';
import {
  missingOperationProofClaims,
  resolveOperationProofSources,
  type OperationProofSource,
} from './operation-proof-source.ts';
import {
  resolveExperienceFeatureProofSources,
  type ExperienceFeatureProofSource,
} from './experience-feature-proof-source.ts';

export type RepositoryOperationEvidence = Readonly<
  Record<string, StaticArchitecturePaths>
>;

export type RepositoryOperationEvidenceResolution =
  | Readonly<{
      kind: 'invalid';
      violations: readonly TopologyViolation[];
    }>
  | Readonly<{
      kind: 'resolved';
      operations: RepositoryOperationEvidence;
    }>;

type OwnerSource = Readonly<{
  directory: string;
  name: string;
  sourceFiles: readonly string[];
  testFiles: readonly string[];
}>;

type UnprovenArchitecturePaths = Omit<StaticArchitecturePaths, 'proofs'>;

const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const typescriptSourcePattern = /[.]tsx?$/u;
const testSourcePattern = /[.](?:spec|test)[.]tsx?$/u;

const listTypeScriptFiles = (directory: string): readonly string[] => {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory())
        return ignoredDirectories.has(entry.name)
          ? []
          : listTypeScriptFiles(entryPath);
      return entry.isFile() && typescriptSourcePattern.test(entry.name)
        ? [entryPath]
        : [];
    })
    .sort();
};

const readPackageName = (directory: string): string | null => {
  const manifestPath = path.join(directory, 'package.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('name' in manifest) ||
    typeof manifest.name !== 'string'
  )
    return null;
  return manifest.name;
};

const ownerSources = (repositoryRoot: string): readonly OwnerSource[] =>
  Object.freeze(
    ['systems', 'experiences'].flatMap((group) => {
      const groupDirectory = path.join(repositoryRoot, group);
      if (!existsSync(groupDirectory)) return [];
      return readdirSync(groupDirectory, { withFileTypes: true }).flatMap(
        (entry) => {
          if (!entry.isDirectory()) return [];
          const directory = path.join(groupDirectory, entry.name);
          const name = readPackageName(directory);
          if (name === null) return [];
          const files = listTypeScriptFiles(directory).filter((file) =>
            file.includes(`${path.sep}src${path.sep}`),
          );
          return [
            Object.freeze({
              directory,
              name,
              sourceFiles: Object.freeze(
                files.filter((file) => !testSourcePattern.test(file)),
              ),
              testFiles: Object.freeze(
                files.filter((file) => testSourcePattern.test(file)),
              ),
            }),
          ];
        },
      );
    }),
  );

const ownerFor = (
  owners: readonly OwnerSource[],
  moduleSpecifier: string,
): OwnerSource | null =>
  [...owners]
    .sort((left, right) => right.name.length - left.name.length)
    .find(
      (candidate) =>
        moduleSpecifier === candidate.name ||
        moduleSpecifier.startsWith(`${candidate.name}/`),
    ) ?? null;

const repositoryPath = (repositoryRoot: string, file: string): string =>
  path.relative(repositoryRoot, file).split(path.sep).join('/');

const exportedConstNames = (file: string): ReadonlySet<string> => {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported !== true) continue;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
  }
  return names;
};

const matchesRole = (file: string, role: RegExp): boolean =>
  role.test(path.basename(file).replace(/[.]tsx?$/u, ''));

const uniquePaths = (
  repositoryRoot: string,
  candidates: readonly string[],
  role: RegExp,
): readonly string[] =>
  Object.freeze(
    [...new Set(candidates.filter((file) => matchesRole(file, role)))]
      .map((file) => repositoryPath(repositoryRoot, file))
      .sort(),
  );

const violation = (operationId: string, message: string): TopologyViolation =>
  Object.freeze({ code: 'invalid_cell_source', subject: operationId, message });

const featureViolation = (
  featureId: string,
  message: string,
): TopologyViolation =>
  Object.freeze({
    code: 'invalid_experience_feature',
    subject: featureId,
    message,
  });

const isExistingFile = (file: string): boolean =>
  existsSync(file) && statSync(file).isFile();

export const requiresLocalPersistenceAdapter = (input: {
  ownerKind: 'experience' | 'system';
  kind: 'command' | 'process' | 'query' | 'reaction' | 'subscription';
  transaction: 'none' | 'required';
  idempotencyRequired: boolean;
  concurrency: 'none' | 'optimistic' | 'partitioned';
}): boolean => input.ownerKind === 'system' && input.transaction === 'required';

export const resolveRepositoryOperationEvidence = (
  topology: CompiledTopology,
  repositoryRootInput: string,
): RepositoryOperationEvidenceResolution => {
  const repositoryRoot = path.resolve(repositoryRootInput);
  const owners = ownerSources(repositoryRoot);
  const violations: TopologyViolation[] = [];
  const pathsById = new Map<string, UnprovenArchitecturePaths>();
  const cellsById = new Map<string, string>();
  const compiledById = new Map(
    topology.cells.map((cell) => [cell.manifest.id, cell] as const),
  );
  const declarationNames = new Map<string, ReadonlySet<string>>();
  const featuresByOperation = new Map<string, StaticArchitectureFeature[]>();

  for (const experience of topology.experiences)
    for (const feature of experience.features) {
      const sourceFile = path.join(
        repositoryRoot,
        feature.source.repositoryPath,
      );
      if (!isExistingFile(sourceFile))
        violations.push(
          featureViolation(
            feature.id,
            `Feature declaration path does not exist: ${feature.source.repositoryPath}.`,
          ),
        );
      else if (
        !exportedConstNames(sourceFile).has(feature.source.manifestExportName)
      )
        violations.push(
          featureViolation(
            feature.id,
            `Feature declaration path does not export ${feature.source.manifestExportName}.`,
          ),
        );

      for (const proof of [
        ...feature.stateProofs,
        ...feature.componentProofs,
      ]) {
        const proofFile = path.join(repositoryRoot, proof);
        if (!isExistingFile(proofFile))
          violations.push(
            featureViolation(
              feature.id,
              `Focused UI proof path does not exist: ${proof}.`,
            ),
          );
      }

      const resolved = Object.freeze({
        id: feature.id,
        experience: experience.id,
        path: feature.source.repositoryPath,
        uses: feature.operationIds,
        stateProofs: feature.stateProofs,
        componentProofs: feature.componentProofs,
      });
      for (const operationId of feature.operationIds) {
        const consumers = featuresByOperation.get(operationId) ?? [];
        consumers.push(resolved);
        featuresByOperation.set(operationId, consumers);
      }
    }

  const featureProofPaths = [
    ...new Set(
      topology.experiences.flatMap((experience) =>
        experience.features.flatMap((feature) => [
          ...feature.stateProofs,
          ...feature.componentProofs,
        ]),
      ),
    ),
  ];
  const featureProofSources: ExperienceFeatureProofSource[] =
    featureProofPaths.flatMap((proofPath) => {
      const proofFile = path.join(repositoryRoot, proofPath);
      return isExistingFile(proofFile)
        ? [{ path: proofPath, source: readFileSync(proofFile, 'utf8') }]
        : [];
    });
  const featureProofResolution = resolveExperienceFeatureProofSources(
    topology.experiences.flatMap((experience) =>
      experience.features.map((feature) => ({
        featureId: feature.id,
        declarationExportName: feature.source.manifestExportName,
        declarationPath: feature.source.repositoryPath,
        stateProofs: feature.stateProofs,
        componentProofs: feature.componentProofs,
      })),
    ),
    featureProofSources,
  );
  if (featureProofResolution.kind === 'invalid')
    for (const proofIssue of featureProofResolution.issues)
      violations.push(
        featureViolation(
          proofIssue.featureId ?? 'experience-feature-proof',
          `${proofIssue.path}: ${proofIssue.message}`,
        ),
      );

  for (const compiled of topology.cells) {
    const operationId = compiled.manifest.id;
    const owner = ownerFor(owners, compiled.source.moduleSpecifier);
    if (owner === null) {
      violations.push(
        violation(
          operationId,
          `No repository owner matches ${JSON.stringify(compiled.source.moduleSpecifier)}.`,
        ),
      );
      continue;
    }
    const declarations = owner.sourceFiles.filter((file) => {
      const names = declarationNames.get(file) ?? exportedConstNames(file);
      declarationNames.set(file, names);
      return names.has(compiled.source.manifestExportName);
    });
    if (declarations.length !== 1) {
      violations.push(
        violation(
          operationId,
          `Expected one exported declaration ${compiled.source.manifestExportName}; found ${declarations.length}.`,
        ),
      );
      continue;
    }
    const declarationFile = declarations[0];
    if (declarationFile === undefined) continue;
    const declarationPath = repositoryPath(repositoryRoot, declarationFile);
    if (
      path.basename(declarationFile) !== 'cell.ts' ||
      !declarationPath.includes('/src/cells/')
    )
      violations.push(
        violation(
          operationId,
          `Cell declaration must be the owning cell.ts under src/cells; found ${declarationPath}.`,
        ),
      );
    const cellDirectory = path.dirname(declarationFile);
    const localPrefix = `${cellDirectory}${path.sep}`;
    const localSources = owner.sourceFiles.filter((file) =>
      file.startsWith(localPrefix),
    );
    const localTests = owner.testFiles
      .filter((file) => file.startsWith(localPrefix))
      .map((file) => repositoryPath(repositoryRoot, file));
    const contracts = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:boundary|contract|schema)(?:[.]|$)/u,
    );
    const decisions = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:algorithm|confirmation|decide|decision|idempotency|lifecycle|policy)(?:[.]|$)/u,
    );
    const executors = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:execute|usecase)(?:[.]|$)/u,
    );
    const persistence = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:persistence[.]mapper|postgres|repo|store)(?:[.]|$)/u,
    );
    const state = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:entity|lifecycle|model|projection|state|types|value)(?:[.]|$)/u,
    );
    const events = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:event|events|message|outbox)(?:[.]|$)/u,
    );
    const protocols = uniquePaths(
      repositoryRoot,
      localSources,
      /(?:^|[.])(?:boundary-profiles|cli|event-stream|http|job|surface)(?:[.]|$)/u,
    );

    if (contracts.length === 0)
      violations.push(
        violation(operationId, 'The cell has no local contract role file.'),
      );
    if (executors.length === 0)
      violations.push(
        violation(operationId, 'The cell has no local executor role file.'),
      );
    const declaresDatabaseControlledWrite = requiresLocalPersistenceAdapter({
      ownerKind: compiled.ownerKind,
      kind: compiled.manifest.kind,
      transaction: compiled.manifest.consistency.transaction,
      idempotencyRequired: compiled.manifest.idempotency.required,
      concurrency: compiled.manifest.consistency.concurrency,
    });
    if (declaresDatabaseControlledWrite && persistence.length === 0)
      violations.push(
        violation(
          operationId,
          'The database-controlled write has no local persistence adapter.',
        ),
      );
    if (localTests.length === 0)
      violations.push(
        violation(operationId, 'The cell has no local test source.'),
      );
    if (compiled.manifest.surfaces.length > 0 && protocols.length === 0)
      violations.push(
        violation(
          operationId,
          'The cell declares a protocol surface but has no local protocol role file.',
        ),
      );
    if (
      compiled.manifest.emits.length + compiled.manifest.consumes.length > 0 &&
      events.length === 0
    )
      violations.push(
        violation(
          operationId,
          'The cell declares messages but has no local event or message role file.',
        ),
      );

    cellsById.set(operationId, declarationPath);
    pathsById.set(
      operationId,
      Object.freeze({
        cell: declarationPath,
        contracts,
        decisions,
        executors,
        persistence,
        state,
        events,
        protocols,
        tests: Object.freeze(localTests.sort()),
        features: Object.freeze(
          [...(featuresByOperation.get(operationId) ?? [])].sort(
            (left, right) => left.id.localeCompare(right.id),
          ),
        ),
      }),
    );
  }

  const operationIdsByCell = new Map<string, string[]>();
  for (const [operationId, cellPath] of cellsById) {
    const operationIds = operationIdsByCell.get(cellPath) ?? [];
    operationIds.push(operationId);
    operationIdsByCell.set(cellPath, operationIds);
  }
  for (const [cellPath, operationIds] of operationIdsByCell)
    if (operationIds.length > 1)
      for (const operationId of operationIds)
        violations.push(
          violation(
            operationId,
            `Cell path ${cellPath} is shared by ${operationIds.sort().join(', ')}.`,
          ),
        );

  const proofSources: OperationProofSource[] = owners.flatMap((owner) =>
    owner.testFiles.map((file) => ({
      path: repositoryPath(repositoryRoot, file),
      source: readFileSync(file, 'utf8'),
    })),
  );
  const proofResolution = resolveOperationProofSources(
    [...cellsById].map(([operationId, cellPath]) => ({
      operationId,
      cellPath,
      declarationExportName:
        compiledById.get(operationId)?.source.manifestExportName ?? '',
    })),
    proofSources,
  );
  if (proofResolution.kind === 'invalid')
    for (const proofIssue of proofResolution.issues)
      violations.push(
        violation(
          proofIssue.operationId ?? 'repository-operation-proof',
          `${proofIssue.path}: ${proofIssue.message}`,
        ),
      );

  const operations: Record<string, StaticArchitecturePaths> = {};
  for (const [operationId, paths] of pathsById) {
    const compiled = compiledById.get(operationId);
    if (compiled === undefined) continue;
    const proofs = proofResolution.proofs[operationId] ?? [];
    if (proofs.length > 0) {
      const missingClaims = missingOperationProofClaims(
        {
          kind: compiled.manifest.kind,
          ownerKind: compiled.ownerKind,
          transaction: compiled.manifest.consistency.transaction,
          concurrency: compiled.manifest.consistency.concurrency,
          idempotencyRequired: compiled.manifest.idempotency.required,
          hasDecision: paths.decisions.length > 0,
          hasPersistence: paths.persistence.length > 0,
          hasProtocol: compiled.manifest.surfaces.length > 0,
          hasMessages:
            compiled.manifest.emits.length + compiled.manifest.consumes.length >
            0,
        },
        proofs,
      );
      if (missingClaims.length > 0)
        violations.push(
          violation(
            operationId,
            `Executable local proof is missing: ${missingClaims.join(', ')}.`,
          ),
        );
    }
    const resolvedPaths = Object.freeze({
      ...paths,
      proofs: Object.freeze(
        proofs.map(({ path: proofPath, layer, scenarios }) =>
          Object.freeze({
            path: proofPath,
            layer,
            scenarios: Object.freeze(
              scenarios.map(({ name, proves }) =>
                Object.freeze({ name, proves: Object.freeze([...proves]) }),
              ),
            ),
          }),
        ),
      ),
    });
    operations[operationId] = resolvedPaths;
  }

  if (violations.length > 0)
    return Object.freeze({
      kind: 'invalid',
      violations: Object.freeze(
        [...violations].sort(
          (left, right) =>
            left.subject.localeCompare(right.subject) ||
            left.message.localeCompare(right.message),
        ),
      ),
    });
  return Object.freeze({
    kind: 'resolved',
    operations: Object.freeze(operations),
  });
};
