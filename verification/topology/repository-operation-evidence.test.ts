import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import { compileTopology } from '../../topology/src/compiler.ts';
import {
  requiresLocalPersistenceAdapter,
  resolveRepositoryOperationEvidence,
} from '../../topology/tooling/repository-operation-evidence.ts';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const fixture = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'pressly-operation-proof-'));
  fixtureRoots.push(root);
  for (const [repositoryPath, source] of Object.entries(files)) {
    const target = path.join(root, repositoryPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source, 'utf8');
  }
  return root;
};

const selectedTopology = (...operationIds: readonly string[]) => {
  const compilation = compileTopology(presslyTopology);
  expect(compilation.kind).toBe('compiled');
  if (compilation.kind === 'invalid') return null;
  const cells = operationIds.flatMap((operationId) => {
    const selected = compilation.topology.cells.find(
      ({ manifest }) => manifest.id === operationId,
    );
    return selected === undefined
      ? []
      : [
          {
            ...selected,
            ownerId: 'example',
            source: {
              ...selected.source,
              moduleSpecifier: '@pressly/example-system',
            },
          },
        ];
  });
  expect(cells).toHaveLength(operationIds.length);
  return {
    ...compilation.topology,
    cells,
    cliCommands: [],
    eventStreams: [],
    events: [],
    experiences: [],
    httpRoutes: [],
    jobs: [],
  };
};

const unitProof = `
import { proveOperation } from '@pressly/testkit/operation-proof';
import { createOrderCellDeclaration } from './cell.ts';
proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'unit',
  scenarios: [{
    name: 'executes the local contract decision and protocol',
    proves: ['contract', 'decision', 'executor-success', 'protocol'],
    run: () => { expect(createOrderCellDeclaration).toBeDefined(); },
  }],
});
`;

const postgresProof = `
import { proveOperation } from '@pressly/testkit/operation-proof';
import { createOrderCellDeclaration } from './cell.ts';
proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [{
    name: 'executes every declared durable-write case',
    proves: [
      'postgres-commit',
      'expected-rejection-no-partial-write',
      'unexpected-failure-rollback',
      'same-payload-replay',
      'divergent-key-conflict',
      'same-key-concurrency',
      'declared-concurrency-race',
      'state-message-atomicity',
      'message-compatibility',
    ],
    run: async () => { await Promise.resolve(); },
  }],
});
`;

const completeFixture = (
  changes: Readonly<Record<string, string | null>> = {},
): string => {
  const base: Record<string, string> = {
    'systems/example/package.json': JSON.stringify({
      name: '@pressly/example-system',
    }),
    'systems/example/src/cells/orders/create-order/cell.ts':
      'export const createOrderCellDeclaration = {};\n',
    'systems/example/src/cells/orders/create-order/contract.ts':
      'export const contract = {};\n',
    'systems/example/src/cells/orders/create-order/decide.ts':
      'export const decide = () => true;\n',
    'systems/example/src/cells/orders/create-order/execute.ts':
      'export const execute = () => true;\n',
    'systems/example/src/cells/orders/create-order/postgres.ts':
      'export const postgres = {};\n',
    'systems/example/src/cells/orders/create-order/http.ts':
      'export const http = {};\n',
    'systems/example/src/cells/orders/create-order/events.ts':
      'export const event = {};\n',
    'systems/example/src/cells/orders/create-order/execute.spec.ts': unitProof,
    'systems/example/src/cells/orders/create-order/postgres.int.spec.ts':
      postgresProof,
  };
  for (const [repositoryPath, source] of Object.entries(changes)) {
    if (source === null) delete base[repositoryPath];
    else base[repositoryPath] = source;
  }
  return fixture(base);
};

describe('strict repository operation evidence', () => {
  it('requires an operation-local adapter for positive database-write semantics', () => {
    expect(
      requiresLocalPersistenceAdapter({
        ownerKind: 'system',
        kind: 'command',
        transaction: 'required',
        idempotencyRequired: true,
        concurrency: 'optimistic',
      }),
    ).toBe(true);
    expect(
      requiresLocalPersistenceAdapter({
        ownerKind: 'system',
        kind: 'query',
        transaction: 'none',
        idempotencyRequired: false,
        concurrency: 'none',
      }),
    ).toBe(false);
    expect(
      requiresLocalPersistenceAdapter({
        ownerKind: 'system',
        kind: 'reaction',
        transaction: 'none',
        idempotencyRequired: true,
        concurrency: 'partitioned',
      }),
    ).toBe(false);
  });

  it('resolves only a complete exact cell fixture', () => {
    const topology = selectedTopology('orders.create-order.v1');
    if (topology === null) return;
    const resolution = resolveRepositoryOperationEvidence(
      topology,
      completeFixture(),
    );
    expect(resolution.kind).toBe('resolved');
    if (resolution.kind === 'invalid') return;
    expect(resolution.operations['orders.create-order.v1']).toMatchObject({
      cell: 'systems/example/src/cells/orders/create-order/cell.ts',
      contracts: ['systems/example/src/cells/orders/create-order/contract.ts'],
      decisions: ['systems/example/src/cells/orders/create-order/decide.ts'],
      executors: ['systems/example/src/cells/orders/create-order/execute.ts'],
      persistence: [
        'systems/example/src/cells/orders/create-order/postgres.ts',
      ],
    });
    expect(
      resolution.operations['orders.create-order.v1']?.proofs,
    ).toHaveLength(2);
  });

  it('rejects missing local roles and owner-root proof fallback', () => {
    const topology = selectedTopology('orders.create-order.v1');
    if (topology === null) return;
    const resolution = resolveRepositoryOperationEvidence(
      topology,
      completeFixture({
        'systems/example/src/cells/orders/create-order/contract.ts': null,
        'systems/example/src/cells/orders/create-order/execute.spec.ts': null,
        'systems/example/src/create-order.spec.ts': unitProof,
      }),
    );
    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(
      resolution.violations.map(({ message }) => message).join('\n'),
    ).toMatch(/no local contract role file|Proof must live under/);
    expect(
      resolution.violations.some(({ message }) =>
        message.includes('Proof must live under'),
      ),
    ).toBe(true);
  });

  it('rejects a missing positive PostgreSQL claim', () => {
    const topology = selectedTopology('orders.create-order.v1');
    if (topology === null) return;
    const resolution = resolveRepositoryOperationEvidence(
      topology,
      completeFixture({
        'systems/example/src/cells/orders/create-order/postgres.int.spec.ts':
          postgresProof.replace("      'declared-concurrency-race',\n", ''),
      }),
    );
    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(
      resolution.violations.some(({ message }) =>
        message.includes('declared-concurrency-race'),
      ),
    ).toBe(true);
  });

  it('rejects two selected operations sharing one declaration path', () => {
    const topology = selectedTopology(
      'orders.create-order.v1',
      'orders.cancel-order.v1',
    );
    if (topology === null) return;
    const root = completeFixture({
      'systems/example/src/cells/orders/create-order/cell.ts':
        'export const createOrderCellDeclaration = {};\nexport const cancelOrderCellDeclaration = {};\n',
    });
    const resolution = resolveRepositoryOperationEvidence(topology, root);
    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(
      resolution.violations.some(({ message }) =>
        message.includes('is shared by orders.cancel-order.v1'),
      ),
    ).toBe(true);
  });

  it('resolves every selected operation without owner fallback', () => {
    const compilation = compileTopology(presslyTopology);
    expect(compilation.kind).toBe('compiled');
    if (compilation.kind === 'invalid') return;

    const resolution = resolveRepositoryOperationEvidence(
      compilation.topology,
      repositoryRoot,
    );
    expect(resolution.kind).toBe('resolved');
    if (resolution.kind === 'invalid') return;
    expect(Object.keys(resolution.operations)).toHaveLength(193);
    expect(
      Object.values(resolution.operations).every(
        ({ cell, contracts, executors, tests, proofs }) =>
          cell.includes('/src/cells/') &&
          cell.endsWith('/cell.ts') &&
          contracts.length > 0 &&
          executors.length > 0 &&
          tests.length > 0 &&
          proofs.length > 0,
      ),
    ).toBe(true);
  });
});
