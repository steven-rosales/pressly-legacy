import { proveOperation } from '@pressly/testkit/operation-proof';
import { previewOrderBacklogCellDeclaration } from './cell.ts';
import type { ProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/contract.ts';
import { describe, expect, it } from 'vitest';
import { previewOrderBacklogContract } from './contract.ts';

const orderId = '71000000-0000-4000-8000-000000000001';
const cutoff = '2026-08-01T00:00:00.000Z';

describe('preview order backlog contract', () => {
  proveOperation({
    operationId: 'production.preview-order-backlog.v1',
    declaration: previewOrderBacklogCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'combines strict route params and body while applying exact defaults',
        proves: ['contract'],
        run: () => {
          expect(
            previewOrderBacklogContract.input.decode({
              params: { locationId: 'location-1' },
              body: {
                filter: 'all_due_before_cutoff',
                cutoff,
                reason: 'processor_not_in_use',
              },
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              filter: 'all_due_before_cutoff',
              cutoff,
              reason: 'processor_not_in_use',
              cursor: null,
              maxOrders: 250,
            },
          });

          expect(
            previewOrderBacklogContract.input.decode({
              params: { locationId: 'location-1', extra: true },
              body: {
                filter: 'all_due_before_cutoff',
                cutoff,
                reason: 'processor_not_in_use',
                maxOrders: 251,
                category: 'ready_to_archive',
              },
            }),
          ).toMatchObject({ kind: 'invalid' });
        },
      },
    ],
  });

  it('round-trips the exact nested serialized preview', () => {
    const preview: ProductionOrderBacklogPreview = {
      locationId: 'location-1',
      filter: 'all_due_before_cutoff',
      cutoff,
      reason: 'processor_not_in_use',
      maxOrders: 1,
      candidateCount: 1,
      hasMore: false,
      cursor: null,
      nextCursor: null,
      previewHash: 'a'.repeat(64),
      generatedAt: '2026-08-22T15:00:00.000Z',
      groups: {
        readyToArchive: [
          {
            orderId,
            displayReference: 'ORDER-1',
            dueAt: '2026-07-01T00:00:00.000Z',
            category: 'ready_to_archive',
            reasons: ['no_operator_owned_facts'],
            expectedVersion: 2,
            expectedResolutionState: 'open',
          },
        ],
        reviewIndividually: [],
        keptForSafety: [],
        alreadyHistorical: [],
      },
    };

    expect(
      previewOrderBacklogContract.output.decode(
        previewOrderBacklogContract.output.encode(preview),
      ),
    ).toEqual({ kind: 'valid', value: preview });
  });

  it('preserves both cursor failure reasons under the one public failure code', () => {
    for (const [reason, message] of [
      [
        'production_order_backlog_cursor_invalid',
        'The backlog cursor is invalid.',
      ],
      [
        'production_order_backlog_cursor_scope_mismatch',
        'The backlog cursor does not belong to this review scope.',
      ],
    ] as const) {
      const failure = {
        tag: 'ProductionFailure' as const,
        kind: 'validation' as const,
        classification: 'malformed' as const,
        code: 'production_order_backlog_cursor_invalid' as const,
        message,
        safeMessage: message,
        details: { reason },
      };
      expect(
        previewOrderBacklogContract.failure.decode(
          previewOrderBacklogContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
    }
  });
});
