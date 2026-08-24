import { describe, expect, it, vi } from 'vitest';
import { makePublishSchedulerConfigCell } from './cell.ts';
import { publishSchedulerConfigIdempotency } from './idempotency.ts';

describe('production.publish-scheduler-config.v1 cell', () => {
  it('declares the exact selected command protocol without messages', () => {
    const cell = makePublishSchedulerConfigCell({
      repo: { transaction: vi.fn() },
      idempotency: publishSchedulerConfigIdempotency,
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
      ids: { next: () => '10000000-0000-4000-8000-000000000001' },
    });
    const input = {
      locationId: 'location-1',
      actorId: '10000000-0000-4000-8000-000000000001',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      stageFitAssertion: {
        sortingFits: true as const,
        washingFits: true as const,
        dryingFits: true as const,
      },
      idempotencyKey: 'scheduler-config-command-1',
    };

    expect(cell.id).toBe('production.publish-scheduler-config.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:schedule',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    if (cell.authorization?.timing !== 'after-input')
      return expect.unreachable('Location authorization must follow input.');
    expect(cell.authorization.scope(input)).toBe('location-1');
    expect(cell.consistency).toMatchObject({
      transaction: 'required',
      concurrency: 'partitioned',
    });
    expect(cell.consistency.concurrencyKey?.(input)).toBe('location-1');
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'POST',
        path: '/production/locations/:locationId/scheduler-configs',
        bodyLimit: '64kb',
        authorization: 'staged',
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
