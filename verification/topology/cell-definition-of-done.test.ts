import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { architectureMap } from '../../generated/architecture-map.ts';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import {
  compileTopology,
  type CompiledTopology,
} from '../../topology/src/compiler.ts';
import {
  explainOperation,
  formatArchitectureExplanation,
} from '../../topology/src/explain.ts';
import {
  presslyRepositoryRoot,
  resolvePresslyArtifacts,
} from '../../topology/tooling/filesystem-artifacts.ts';
import {
  resolveRepositoryOperationEvidence,
  type RepositoryOperationEvidence,
} from '../../topology/tooling/repository-operation-evidence.ts';
import {
  findCellRolePostgresQueryImports,
  cellDefinitionOfDoneExceptionRules,
  cellDefinitionOfDoneObligations,
  type SourceText,
} from './cell-definition-of-done.ts';
import {
  deriveCellDefinitionOfDoneIndex,
  type DefinitionOfDoneContext,
} from './cell-definition-of-done-evidence.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../..');

type ResolvedEvidence = Readonly<{
  topology: CompiledTopology;
  operations: RepositoryOperationEvidence;
}>;

let evidenceCache: ResolvedEvidence | null | undefined;

const compiledPresslyTopology = () => {
  const compilation = compileTopology(presslyTopology);
  expect(compilation.kind).toBe('compiled');
  if (compilation.kind === 'invalid') return null;
  return compilation.topology;
};

const resolvedEvidence = (): ResolvedEvidence | null => {
  if (evidenceCache !== undefined) return evidenceCache;
  const topology = compiledPresslyTopology();
  if (topology === null) {
    evidenceCache = null;
    return evidenceCache;
  }
  const resolution = resolveRepositoryOperationEvidence(
    topology,
    repositoryRoot,
  );
  expect(resolution).toMatchObject({ kind: 'resolved' });
  if (resolution.kind === 'invalid') {
    evidenceCache = null;
    return evidenceCache;
  }
  evidenceCache = { topology, operations: resolution.operations };
  return evidenceCache;
};

const allPaths = (operationId: string): readonly string[] => {
  const operation = architectureMap.operations.find(
    (candidate) => candidate.id === operationId,
  );
  const paths = operation?.paths;
  if (paths === null || paths === undefined) return [];
  return [
    paths.cell,
    ...paths.contracts,
    ...paths.decisions,
    ...paths.executors,
    ...paths.persistence,
    ...paths.state,
    ...paths.events,
    ...paths.protocols,
    ...paths.tests,
    ...paths.proofs.map((proof) => proof.path),
  ];
};

const residueAudit = spawnSync(
  process.execPath,
  ['tooling/scripts/audit-final-residue.mjs'],
  { cwd: repositoryRoot, encoding: 'utf8' },
);

const definitionOfDoneContext: DefinitionOfDoneContext = {
  repositoryPathExists: (repositoryPath) =>
    existsSync(path.join(repositoryRoot, repositoryPath)),
  generatedClientContainsOperation: (repositoryPath, operationId) => {
    const target = path.join(repositoryRoot, repositoryPath);
    return (
      existsSync(target) && readFileSync(target, 'utf8').includes(operationId)
    );
  },
  legacyAndCompatibilityRemoved: residueAudit.status === 0,
};

const listCellRoleSources = (directory: string): readonly SourceText[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'dist' || entry.name === 'node_modules'
        ? []
        : listCellRoleSources(entryPath);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return [
      Object.freeze({
        path: path
          .relative(repositoryRoot, entryPath)
          .split(path.sep)
          .join('/'),
        source: readFileSync(entryPath, 'utf8'),
      }),
    ];
  });
};

describe('permanent cell definition of done', () => {
  it('executes the final source-residue audit as completion evidence', () => {
    expect(
      residueAudit.status,
      `${residueAudit.stdout}\n${residueAudit.stderr}`,
    ).toBe(0);
  });

  it('resolves the exact 193-operation topology to existing repository paths', async () => {
    const resolved = resolvedEvidence();
    expect(resolved).not.toBeNull();
    if (resolved === null) return;

    const topologyIds = resolved.topology.cells.map((cell) => cell.manifest.id);
    const evidenceIds = Object.keys(resolved.operations);
    const generatedIds = architectureMap.operations.map(
      (operation) => operation.id,
    );
    expect(topologyIds).toHaveLength(193);
    expect(new Set(topologyIds).size).toBe(193);
    expect(evidenceIds.sort()).toEqual([...topologyIds].sort());
    expect(generatedIds).toEqual([...topologyIds].sort());

    for (const operation of architectureMap.operations) {
      expect(operation.paths).toEqual(resolved.operations[operation.id]);
      expect(operation.paths?.contracts.length).toBeGreaterThan(0);
      expect(operation.paths?.executors.length).toBeGreaterThan(0);
      expect(operation.paths?.tests.length).toBeGreaterThan(0);
      for (const repositoryPath of allPaths(operation.id)) {
        expect(path.isAbsolute(repositoryPath)).toBe(false);
        expect(repositoryPath.startsWith('../')).toBe(false);
        expect(
          existsSync(path.join(repositoryRoot, repositoryPath)),
          `${operation.id}: ${repositoryPath}`,
        ).toBe(true);
      }
    }

    const artifacts = await resolvePresslyArtifacts();
    expect(artifacts.kind).toBe('ready');
    expect(path.resolve(presslyRepositoryRoot)).toBe(repositoryRoot);
  });

  it('derives all 15 definition-of-done outcomes without operation allowlists', () => {
    expect(cellDefinitionOfDoneObligations).toHaveLength(15);
    expect(cellDefinitionOfDoneExceptionRules).toHaveLength(7);
    expect(
      cellDefinitionOfDoneExceptionRules.every(
        (rule) => !('operationIds' in rule),
      ),
    ).toBe(true);

    const index = deriveCellDefinitionOfDoneIndex(
      architectureMap.operations,
      definitionOfDoneContext,
    );
    expect(index).toHaveLength(193);
    expect(index.flatMap((entry) => entry.evidence)).toHaveLength(
      index.length * cellDefinitionOfDoneObligations.length,
    );

    for (const entry of index) {
      expect(entry.evidence.map((item) => item.obligation)).toEqual(
        cellDefinitionOfDoneObligations,
      );
      for (const item of entry.evidence) {
        expect(
          item.outcome,
          `${entry.operationId}:${item.obligation}`,
        ).not.toBe('unmet');
        expect(item.refs.length).toBeGreaterThan(0);
        for (const repositoryPath of item.refs)
          expect(
            existsSync(path.join(repositoryRoot, repositoryPath)),
            `${entry.operationId}:${item.obligation}:${repositoryPath}`,
          ).toBe(true);
        if (item.applicability === 'applicable')
          expect(item.outcome).toBe('met');
        else {
          expect(item.outcome).toBe('not-applicable');
          expect(item.reason.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps generated frontend evidence bound to the consuming Experience', () => {
    const index = deriveCellDefinitionOfDoneIndex(
      architectureMap.operations,
      definitionOfDoneContext,
    );
    for (const entry of index) {
      const frontend = entry.evidence.find(
        (item) => item.obligation === 'generated-frontend-client',
      );
      if (frontend?.applicability !== 'applicable') continue;
      for (const clientPath of frontend.refs.filter((repositoryPath) =>
        repositoryPath.startsWith('generated/clients/'),
      ))
        expect(
          readFileSync(path.join(repositoryRoot, clientPath), 'utf8'),
        ).toContain(entry.operationId);
    }
  });

  it('explains owner, consumers, protocols, auth, consistency, state, events, observation, and paths for every operation', () => {
    const resolved = resolvedEvidence();
    expect(resolved).not.toBeNull();
    if (resolved === null) return;

    for (const cell of resolved.topology.cells) {
      const result = explainOperation(
        resolved.topology,
        cell.manifest.id,
        resolved.operations,
      );
      expect(result.kind).toBe('found');
      if (result.kind === 'not-found') continue;
      expect(result.explanation.owner).toBe(
        `${cell.ownerKind}:${cell.ownerId}`,
      );
      expect(result.explanation.paths).toEqual(
        resolved.operations[cell.manifest.id],
      );
      expect(result.explanation.authentication).toBe(
        cell.manifest.authentication,
      );
      expect(result.explanation.consistency).toHaveLength(3);
      expect(result.explanation.observability).toBe(
        cell.manifest.observability.operation,
      );
      expect(result.explanation.protocols).toHaveLength(
        cell.manifest.surfaces.length,
      );
    }

    const productionOperation = explainOperation(
      resolved.topology,
      'production.advance-stage.v1',
      resolved.operations,
    );
    expect(productionOperation.kind).toBe('found');
    if (productionOperation.kind === 'not-found') return;
    expect(
      formatArchitectureExplanation(productionOperation.explanation),
    ).toContain(
      'Repository paths\n  cell: systems/production/src/cells/floor/advance-stage/cell.ts',
    );
    expect(
      formatArchitectureExplanation(productionOperation.explanation),
    ).toContain('Consumers\n  processor (experience)');
    expect(
      formatArchitectureExplanation(productionOperation.explanation),
    ).toContain('State paths');
    expect(
      formatArchitectureExplanation(productionOperation.explanation),
    ).toContain('Event paths');
  });

  it('forbids PostgreSQL query imports in cell role files and catches a negative fixture', () => {
    const actual = [
      ...listCellRoleSources(path.join(repositoryRoot, 'systems')),
      ...listCellRoleSources(path.join(repositoryRoot, 'experiences')),
    ];
    expect(findCellRolePostgresQueryImports(actual)).toEqual([]);
    expect(
      findCellRolePostgresQueryImports([
        {
          path: 'systems/example/src/cells/orders/create-order/cell.ts',
          source:
            "import { sql } from '@pressly/postgres/query';\nexport const fixture = sql;\n",
        },
        {
          path: 'systems/example/src/cells/orders/create-order/execute.ts',
          source:
            "import { eq } from '@pressly/postgres/query';\nexport const fixture = eq;\n",
        },
        {
          path: 'systems/example/src/cells/orders/create-order/postgres.ts',
          source:
            "import { sql } from '@pressly/postgres/query';\nexport const fixture = sql;\n",
        },
        {
          path: 'systems/example/src/cells/orders/create-order/binder.ts',
          source:
            "import type { PostgresDatabase } from '@pressly/postgres/client';\nexport type Fixture = PostgresDatabase;\n",
        },
      ]),
    ).toEqual([
      'systems/example/src/cells/orders/create-order/cell.ts',
      'systems/example/src/cells/orders/create-order/execute.ts',
    ]);
  });
});
