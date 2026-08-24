import { describe, expect, it } from 'vitest';
import {
  missingOperationProofClaims,
  parseOperationProofSource,
  requiredOperationProofClaims,
  resolveOperationProofSources,
} from '../../topology/tooling/operation-proof-source.ts';

const validSource = `
import { proveOperation } from '@pressly/testkit/operation-proof';
import { createOrderCellDeclaration } from './cell.ts';
proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits once',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        await commitOnce();
      },
    },
  ],
});
`;

describe('typed operation proof source', () => {
  it('parses literal operation, layer, scenario, and claim evidence', () => {
    expect(
      parseOperationProofSource({
        path: 'systems/orders/src/cells/orders/create-order/postgres.int.spec.ts',
        source: validSource,
      }),
    ).toEqual({
      kind: 'parsed',
      proofs: [
        {
          operationId: 'orders.create-order.v1',
          declarationName: 'createOrderCellDeclaration',
          layer: 'postgres',
          path: 'systems/orders/src/cells/orders/create-order/postgres.int.spec.ts',
          scenarios: [
            {
              name: 'commits once',
              proves: ['contract', 'executor-success', 'postgres-commit'],
            },
          ],
        },
      ],
    });
  });

  it('rejects bare references and invented claims', () => {
    const bareReference = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: 'proveOperation(sharedProof);',
    });
    expect(bareReference).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const inventedClaim = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace('postgres-commit', 'looks-green'),
    });
    expect(inventedClaim).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const fakeRegistrar = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace(
        "import { proveOperation } from '@pressly/testkit/operation-proof';",
        'const proveOperation = (value: unknown) => value;',
      ),
    });
    expect(fakeRegistrar).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const siblingDeclaration = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace(
        "from './cell.ts'",
        "from '../cancel-order/cell.ts'",
      ),
    });
    expect(siblingDeclaration).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const nonExecutableScenario = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace(
        'run: async () => {\n        await commitOnce();\n      },',
        'run: true as never,',
      ),
    });
    expect(nonExecutableScenario).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const emptyScenario = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace(
        'run: async () => {\n        await commitOnce();\n      },',
        'run: () => {},',
      ),
    });
    expect(emptyScenario).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });

    const declarationOnlyScenario = parseOperationProofSource({
      path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
      source: validSource.replace(
        'run: async () => {\n        await commitOnce();\n      },',
        'run: () => { void createOrderCellDeclaration; },',
      ),
    });
    expect(declarationOnlyScenario).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'invalid_operation_proof' }],
    });
  });

  it('rejects owner-level and cross-system proof fallback', () => {
    const resolved = resolveOperationProofSources(
      [
        {
          operationId: 'orders.create-order.v1',
          cellPath: 'systems/orders/src/cells/orders/create-order/cell.ts',
          declarationExportName: 'createOrderCellDeclaration',
        },
      ],
      [
        {
          path: 'systems/orders/src/orders.postgres.int.spec.ts',
          source: validSource,
        },
        {
          path: 'verification/flows/order.flow.int.test.ts',
          source: validSource,
        },
      ],
    );
    expect(resolved).toMatchObject({
      kind: 'invalid',
      issues: [
        { code: 'missing_operation_proof' },
        { code: 'nonlocal_operation_proof' },
        { code: 'nonlocal_operation_proof' },
      ],
    });
  });

  it('rejects a different declaration exported by the same cell file', () => {
    const resolved = resolveOperationProofSources(
      [
        {
          operationId: 'orders.create-order.v1',
          cellPath: 'systems/orders/src/cells/orders/create-order/cell.ts',
          declarationExportName: 'createOrderCellDeclaration',
        },
      ],
      [
        {
          path: 'systems/orders/src/cells/orders/create-order/proof.spec.ts',
          source: validSource.replaceAll(
            'createOrderCellDeclaration',
            'unrelatedCellDeclaration',
          ),
        },
      ],
    );
    expect(resolved).toMatchObject({
      kind: 'invalid',
      issues: [
        { code: 'missing_operation_proof' },
        { code: 'invalid_operation_proof' },
      ],
    });
  });

  it('requires claims from positive operation semantics', () => {
    const profile = {
      kind: 'command',
      ownerKind: 'system',
      transaction: 'required',
      concurrency: 'optimistic',
      idempotencyRequired: true,
      hasDecision: true,
      hasPersistence: true,
      hasProtocol: true,
      hasMessages: true,
    } as const;
    expect(requiredOperationProofClaims(profile)).toEqual([
      'contract',
      'executor-success',
      'decision',
      'protocol',
      'message-compatibility',
      'postgres-commit',
      'expected-rejection-no-partial-write',
      'unexpected-failure-rollback',
      'same-payload-replay',
      'divergent-key-conflict',
      'same-key-concurrency',
      'declared-concurrency-race',
      'state-message-atomicity',
    ]);
    expect(
      missingOperationProofClaims(profile, [
        {
          operationId: 'orders.create-order.v1',
          declarationName: 'createOrderCellDeclaration',
          layer: 'unit',
          path: 'proof.spec.ts',
          scenarios: [
            {
              name: 'only success',
              proves: ['contract', 'executor-success', 'postgres-commit'],
            },
          ],
        },
      ]),
    ).toEqual([
      'decision',
      'protocol',
      'message-compatibility',
      'postgres-commit',
      'expected-rejection-no-partial-write',
      'unexpected-failure-rollback',
      'same-payload-replay',
      'divergent-key-conflict',
      'same-key-concurrency',
      'declared-concurrency-race',
      'state-message-atomicity',
    ]);
  });
});
