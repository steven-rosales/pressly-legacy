import { nullLogger } from '@pressly/logging';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanupApiAfterFailure,
  cleanupApiOrThrow,
  runApiCleanupPlan,
  type ApiCleanupPlan,
} from '../../src/bootstrap/api-cleanup.ts';

describe('API cleanup plan', () => {
  it('settles peer effects and continues through dependent stages', async () => {
    const feedFailure = new Error('feed close failed');
    const reporterFailure = new Error('reporter close failed');
    const calls: string[] = [];
    const plan: ApiCleanupPlan = [
      [
        {
          resource: 'server',
          run: async () => {
            calls.push('server');
          },
        },
        {
          resource: 'feed',
          run: () => {
            calls.push('feed');
            throw feedFailure;
          },
        },
      ],
      [
        {
          resource: 'database',
          run: async () => {
            calls.push('database');
          },
        },
      ],
      [
        {
          resource: 'reporter',
          run: async () => {
            calls.push('reporter');
            throw reporterFailure;
          },
        },
      ],
    ];

    await expect(runApiCleanupPlan(plan)).resolves.toEqual([
      { resource: 'feed', cause: feedFailure },
      { resource: 'reporter', cause: reporterFailure },
    ]);
    expect(calls).toEqual(['server', 'feed', 'database', 'reporter']);
  });

  it('preserves the primary failure after every cleanup attempt', async () => {
    const primaryError = new Error('startup failed');
    const laterCleanup = vi.fn(async () => undefined);
    const plan: ApiCleanupPlan = [
      [
        {
          resource: 'feed',
          run: async () => {
            throw new Error('feed close failed');
          },
        },
      ],
      [{ resource: 'database', run: laterCleanup }],
    ];

    await expect(
      cleanupApiAfterFailure({
        primaryError,
        plan,
        logger: {
          ...nullLogger,
          error: () => {
            throw new Error('logger unavailable');
          },
        },
      }),
    ).rejects.toBe(primaryError);
    expect(laterCleanup).toHaveBeenCalledOnce();
  });

  it('aggregates standalone shutdown failures into one semantic error', async () => {
    const first = new Error('server close failed');
    const second = new Error('feed close failed');
    const plan: ApiCleanupPlan = [
      [
        {
          resource: 'server',
          run: async () => {
            throw first;
          },
        },
        {
          resource: 'feed',
          run: async () => {
            throw second;
          },
        },
      ],
    ];

    await expect(cleanupApiOrThrow(plan)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'UnexpectedError',
      code: 'api_cleanup_failed',
      details: { resources: ['server', 'feed'] },
      cause: expect.any(AggregateError),
    });
  });
});
