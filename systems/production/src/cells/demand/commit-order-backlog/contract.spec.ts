import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderBacklogCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { commitOrderBacklogContract } from './contract.ts';
import type {
  CommitOrderBacklogCommand,
  CommitOrderBacklogExpectedFailure,
  CommitOrderBacklogResult,
} from './types.ts';

const command: CommitOrderBacklogCommand = {
  locationId: 'location-1',
  actorId: '75000000-0000-4000-8000-000000000001',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  note: null,
  previewHash: 'a'.repeat(64),
  idempotencyKey: 'commit-backlog-command-1',
};

describe('commit order backlog contract', () => {
  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the strict request and authenticated actor',
        proves: ['contract'],
        run: () => {
          const encoded = commitOrderBacklogContract.input.encode(command);
          expect(commitOrderBacklogContract.input.decode(encoded)).toEqual({
            kind: 'valid',
            value: command,
          });
          expect(
            commitOrderBacklogContract.input.decode({
              params: { locationId: command.locationId },
              body: {
                filter: command.filter,
                cutoff: command.cutoff,
                reason: command.reason,
                previewHash: command.previewHash,
                idempotencyKey: command.idempotencyKey,
              },
              actorId: command.actorId,
            }),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });

  it('preserves body-before-params issue precedence and strict other-note rules', () => {
    const decoded = commitOrderBacklogContract.input.decode({
      params: { locationId: '' },
      body: {
        filter: 'wrong',
        cutoff: 'not-an-instant',
        reason: 'other',
        previewHash: 'short',
        idempotencyKey: 'short',
        candidateIds: [],
      },
      actorId: '',
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind !== 'invalid') return;
    expect(decoded.issues[0]?.path[0]).toBe('body');
    expect(decoded.issues.some((issue) => issue.path[0] === 'params')).toBe(
      true,
    );
    expect(decoded.issues.at(-1)?.path).toEqual(['actorId']);
  });

  it('round-trips the exact result and every expected failure shape', () => {
    const result: CommitOrderBacklogResult = {
      locationId: command.locationId,
      bulkOperationId: '75000000-0000-4000-8000-000000000002',
      previewHash: command.previewHash,
      nextCursor: null,
      resolvedCount: 1,
      resolved: [
        {
          orderId: '75000000-0000-4000-8000-000000000003',
          resolutionState: 'resolved_without_production',
          version: 2,
        },
      ],
      committedAt: '2026-08-22T16:00:00.000Z',
      replayed: false,
    };
    expect(
      commitOrderBacklogContract.output.decode(
        commitOrderBacklogContract.output.encode(result),
      ),
    ).toEqual({ kind: 'valid', value: result });

    const failures: CommitOrderBacklogExpectedFailure[] = [
      {
        tag: 'ProductionFailure',
        kind: 'validation',
        classification: 'malformed',
        code: 'production_order_backlog_cursor_invalid',
        message: 'The backlog cursor is invalid.',
        safeMessage: 'The backlog cursor is invalid.',
        details: { reason: 'production_order_backlog_cursor_invalid' },
      },
      {
        tag: 'ProductionFailure',
        kind: 'conflict',
        code: 'production_order_backlog_preview_stale',
        message: 'The preview is stale.',
        safeMessage: 'The preview is stale.',
      },
    ];
    for (const failure of failures)
      expect(
        commitOrderBacklogContract.failure.decode(
          commitOrderBacklogContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });
});
