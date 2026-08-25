import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeReplaceShiftSelectionCell } from './cell.ts';
import { replaceShiftSelectionIdempotency } from './idempotency.ts';

describe('production.replace-shift-selection.v1 cell', () => {
  it('declares the exact selected command protocol and no messages', () => {
    const cell = makeReplaceShiftSelectionCell({
      repo: { transaction: vi.fn() },
      idempotency: replaceShiftSelectionIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
    });

    expect(cell.id).toBe('production.replace-shift-selection.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:schedule',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    if (cell.authorization?.timing !== 'after-input')
      return expect.unreachable('Location authorization must follow input.');
    expect(
      cell.authorization.scope({
        locationId: 'location-1',
        productionShiftId: '10000000-0000-4000-8000-000000000001',
        actorId: '10000000-0000-4000-8000-000000000002',
        selectedOrderIds: [],
        expectedVersion: 0,
        idempotencyKey: 'replace-selection-command-1',
      }),
    ).toBe('location-1');
    expect(cell.consistency).toEqual({
      transaction: 'required',
      concurrency: 'optimistic',
      expectedVersion: expect.any(Function),
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'PUT',
        path: '/production/locations/:locationId/shifts/:productionShiftId/selection',
        bodyLimit: '64kb',
        authorization: 'staged',
        validateRequest: expect.any(Function),
        decodeAuthorizationScope: expect.any(Function),
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
