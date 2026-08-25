import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeAcceptScheduleCell } from './cell.ts';
import { acceptScheduleIdempotency } from './idempotency.ts';

describe('production.accept-schedule.v1 cell', () => {
  it('declares the exact selected command protocol without messages', () => {
    const cell = makeAcceptScheduleCell({
      repo: { transaction: vi.fn() },
      idempotency: acceptScheduleIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
    });
    expect(cell.id).toBe('production.accept-schedule.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:accept',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    expect(cell.consistency).toEqual({
      transaction: 'required',
      concurrency: 'optimistic',
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'POST',
        path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
        bodyLimit: '64kb',
        authorization: 'staged',
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
