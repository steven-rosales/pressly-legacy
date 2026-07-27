import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig, laundryProduction } from '../src/index.ts';

describe('production order resolution schema', () => {
  it('persists resolution separately from execution and operational status', () => {
    const table = laundryProduction.productionOrders;

    expect(table.resolutionState.name).toBe('resolution_state');
    expect(table.resolutionState.notNull).toBe(true);
    expect(table.resolutionState.hasDefault).toBe(true);
    expect(table.resolvedAt.name).toBe('resolved_at');
    expect(table.resolvedBy.name).toBe('resolved_by');
    expect(table.resolutionReason.name).toBe('resolution_reason');
    expect(table.resolutionNote.name).toBe('resolution_note');
    expect(table.resolutionBulkOperationId.name).toBe(
      'resolution_bulk_operation_id',
    );

    expect(table.executionStatus.name).toBe('execution_status');
    expect(table.operationalStatus.name).toBe('status');
  });

  it('checks coherent metadata and supports bounded location reads', () => {
    const config = getTableConfig(laundryProduction.productionOrders);

    expect(config.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        'production_orders_resolution_state_valid',
        'production_orders_resolution_reason_valid',
        'production_orders_resolution_metadata_consistent',
      ]),
    );

    const resolutionIndex = config.indexes.find(
      (candidate) =>
        candidate.config.name ===
        'production_orders_location_resolution_due_id_idx',
    );
    expect(resolutionIndex).toBeDefined();
    expect(
      resolutionIndex?.config.columns.map((column) =>
        'name' in column && typeof column.name === 'string'
          ? column.name
          : undefined,
      ),
    ).toEqual(['location_id', 'resolution_state', 'due_at', 'id']);
  });

  it('keeps the forward migration additive and orthogonal to execution', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0033_production-order-resolution.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(migration).not.toContain('"execution_status"');
    expect(migration).not.toMatch(/(?:ADD|ALTER|DROP)\s+COLUMN\s+"status"/i);
  });
});
