import type { StaticArchitectureOperation } from '@pressly/cells';
import { describe, expect, it } from 'vitest';
import {
  deriveCellDefinitionOfDoneEvidence,
  type DefinitionOfDoneContext,
} from './cell-definition-of-done-evidence.ts';

const completeContext: DefinitionOfDoneContext = {
  repositoryPathExists: () => true,
  generatedClientContainsOperation: () => true,
  legacyAndCompatibilityRemoved: true,
};

const operation = (
  overrides: Partial<StaticArchitectureOperation> = {},
): StaticArchitectureOperation => ({
  id: 'orders.create-order.v1',
  kind: 'command',
  authentication: 'required',
  owner: 'orders',
  ownerKind: 'system',
  source: {
    moduleSpecifier: '@pressly/orders-system/cells/create-order',
    manifestExportName: 'createOrderCellDeclaration',
    assemblyExportName: 'makeOrdersSystem',
    assemblyKey: 'createOrder',
  },
  authorization: null,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    idempotencyRequired: true,
  },
  cli: [],
  eventStreams: [],
  http: [],
  jobs: [],
  emits: [],
  consumes: [],
  experienceConsumers: [],
  observability: 'orders.create-order',
  paths: {
    cell: 'systems/orders/src/cells/orders/create-order/cell.ts',
    contracts: ['systems/orders/src/cells/orders/create-order/contract.ts'],
    decisions: ['systems/orders/src/cells/orders/create-order/decide.ts'],
    executors: ['systems/orders/src/cells/orders/create-order/execute.ts'],
    persistence: ['systems/orders/src/cells/orders/create-order/postgres.ts'],
    state: [],
    events: [],
    protocols: [],
    tests: [
      'systems/orders/src/cells/orders/create-order/execute.spec.ts',
      'systems/orders/src/cells/orders/create-order/postgres.int.spec.ts',
    ],
    features: [],
    proofs: [
      {
        path: 'systems/orders/src/cells/orders/create-order/execute.spec.ts',
        layer: 'unit',
        scenarios: [
          {
            name: 'decides and executes',
            proves: ['contract', 'decision', 'executor-success'],
          },
        ],
      },
      {
        path: 'systems/orders/src/cells/orders/create-order/postgres.int.spec.ts',
        layer: 'postgres',
        scenarios: [
          {
            name: 'commits with exact distributed semantics',
            proves: [
              'postgres-commit',
              'expected-rejection-no-partial-write',
              'unexpected-failure-rollback',
              'same-payload-replay',
              'divergent-key-conflict',
              'same-key-concurrency',
              'declared-concurrency-race',
            ],
          },
        ],
      },
    ],
  },
  ...overrides,
});

describe('cell definition of done evidence', () => {
  it('marks a complete positive profile without path-existence fallback', () => {
    const result = deriveCellDefinitionOfDoneEvidence(
      operation(),
      completeContext,
    );
    expect(
      result.evidence.filter(({ outcome }) => outcome === 'unmet'),
    ).toEqual([]);
  });

  it('reports a missing PostgreSQL concurrency claim even when files exist', () => {
    const baseline = operation();
    if (baseline.paths === null) return;
    const proofs = baseline.paths.proofs;
    const changedProofs = proofs.map((proof) => ({
      ...proof,
      scenarios: proof.scenarios.map((scenario) => ({
        ...scenario,
        proves: scenario.proves.filter(
          (claim) => claim !== 'declared-concurrency-race',
        ),
      })),
    }));
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        paths: { ...baseline.paths, proofs: changedProofs },
      }),
      completeContext,
    );
    expect(
      result.evidence.find(
        ({ obligation }) =>
          obligation === 'real-postgres-idempotency-and-concurrency',
      )?.outcome,
    ).toBe('unmet');
  });

  it('does not require PostgreSQL proof for a persistence-backed query', () => {
    const baseline = operation();
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        kind: 'query',
        consistency: {
          transaction: 'none',
          concurrency: 'none',
          idempotencyRequired: false,
        },
        paths:
          baseline.paths === null
            ? null
            : {
                ...baseline.paths,
                decisions: [],
                proofs: [
                  {
                    path: baseline.paths.tests[0] ?? 'query.spec.ts',
                    layer: 'unit',
                    scenarios: [
                      {
                        name: 'reads through an explicit executor',
                        proves: ['contract', 'executor-success'],
                      },
                    ],
                  },
                ],
              },
      }),
      completeContext,
    );
    expect(
      result.evidence.find(
        ({ obligation }) =>
          obligation === 'real-postgres-idempotency-and-concurrency',
      )?.outcome,
    ).toBe('not-applicable');
  });

  it('does not claim repository-global completion from references alone', () => {
    const result = deriveCellDefinitionOfDoneEvidence(operation(), {
      ...completeContext,
      generatedClientContainsOperation: () => false,
      legacyAndCompatibilityRemoved: false,
    });
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'legacy-and-compatibility-removed',
      )?.outcome,
    ).toBe('unmet');
  });

  it('keeps transaction-required persistence applicable when its path disappears', () => {
    const baseline = operation();
    if (baseline.paths === null) return;
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        paths: { ...baseline.paths, persistence: [] },
      }),
      completeContext,
    );
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'isolated-sql-persistence',
      ),
    ).toMatchObject({ applicability: 'applicable', outcome: 'unmet' });
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'complete-architecture-path',
      )?.outcome,
    ).toBe('unmet');
  });

  it('requires live repository paths instead of trusting path strings', () => {
    const result = deriveCellDefinitionOfDoneEvidence(operation(), {
      ...completeContext,
      repositoryPathExists: (repositoryPath) =>
        !repositoryPath.endsWith('/contract.ts'),
    });
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'explicit-versioned-contract',
      )?.outcome,
    ).toBe('unmet');
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'complete-architecture-path',
      )?.outcome,
    ).toBe('unmet');
  });

  it('requires the generated client to contain each browser operation', () => {
    const baseline = operation();
    if (baseline.paths === null) return;
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        http: [
          {
            method: 'POST',
            path: '/orders',
            contextRequirements: [],
          },
        ],
        experienceConsumers: ['control'],
        paths: {
          ...baseline.paths,
          features: [
            {
              id: 'control.orders',
              experience: 'control',
              path: 'experiences/control/src/features/orders/feature.ts',
              uses: ['orders.create-order.v1'],
              stateProofs: [
                'experiences/control/src/features/orders/order-workspace.test.tsx',
              ],
              componentProofs: [
                'experiences/control/src/features/orders/order-workspace.test.tsx',
              ],
            },
          ],
        },
      }),
      {
        ...completeContext,
        generatedClientContainsOperation: () => false,
      },
    );
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'generated-frontend-client',
      ),
    ).toMatchObject({ applicability: 'applicable', outcome: 'unmet' });
  });

  it('does not infer component applicability from a local TSX filename', () => {
    const baseline = operation();
    if (baseline.paths === null) return;
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        owner: 'control',
        ownerKind: 'experience',
        paths: {
          ...baseline.paths,
          tests: ['experiences/control/src/cells/orders/create/cell.test.tsx'],
          features: [],
        },
      }),
      completeContext,
    );
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'generated-frontend-client',
      ),
    ).toMatchObject({
      applicability: 'not-applicable',
      outcome: 'not-applicable',
    });
  });

  it('rejects missing protocol and message role evidence from positive manifests', () => {
    const baseline = operation();
    if (baseline.paths === null) return;
    const result = deriveCellDefinitionOfDoneEvidence(
      operation({
        http: [
          {
            method: 'POST',
            path: '/orders',
            contextRequirements: [],
          },
        ],
        emits: ['orders.created.v1'],
        paths: { ...baseline.paths, events: [], protocols: [] },
      }),
      completeContext,
    );
    expect(
      result.evidence.find(
        ({ obligation }) => obligation === 'declarative-protocol-registration',
      )?.outcome,
    ).toBe('unmet');
    expect(
      result.evidence.find(
        ({ obligation }) =>
          obligation === 'backward-compatible-cross-system-messages',
      )?.outcome,
    ).toBe('unmet');
  });
});
