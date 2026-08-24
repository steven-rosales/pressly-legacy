import { proveOperation } from '@pressly/testkit/operation-proof';
import { publishSchedulerConfigCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { publishSchedulerConfigContract } from './contract.ts';
import type { SchedulerConfig } from './types.ts';

const actorId = '10000000-0000-4000-8000-000000000001';
const configId = '10000000-0000-4000-8000-000000000002';

const serializedInput = {
  params: { locationId: 'location-1' },
  body: {
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    idempotencyKey: 'scheduler-config-command-1',
  },
  actorId,
} as const;

const config: SchedulerConfig = {
  id: configId,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 4,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: actorId,
    assertedAt: '2026-08-22T14:00:00.000Z',
  },
  publishedAt: '2026-08-22T14:00:00.000Z',
};

describe('publish scheduler config contract', () => {
  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes and re-encodes the strict deployed request plus actor context',
        proves: ['contract'],
        run: () => {
          const expected = {
            locationId: 'location-1',
            actorId,
            pulseMinutes: 56,
            foldLbsPerFolderMinute: 2,
            stageFitAssertion: serializedInput.body.stageFitAssertion,
            idempotencyKey: 'scheduler-config-command-1',
          };
          expect(
            publishSchedulerConfigContract.input.decode(serializedInput),
          ).toEqual({ kind: 'valid', value: expected });
          expect(publishSchedulerConfigContract.input.encode(expected)).toEqual(
            serializedInput,
          );
        },
      },
    ],
  });

  it('uses the canonical positive values and all-true stage-fit assertions', () => {
    const decoded = publishSchedulerConfigContract.input.decode({
      params: { locationId: '' },
      body: {
        ...serializedInput.body,
        pulseMinutes: 0,
        stageFitAssertion: {
          ...serializedInput.body.stageFitAssertion,
          washingFits: false,
        },
      },
      actorId: '',
    });

    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid') {
      const locations = decoded.issues.map((issue) => issue.path[0]);
      expect(locations[0]).toBe('body');
      expect(locations).toEqual(
        expect.arrayContaining(['body', 'params', 'actorId']),
      );
    }
  });

  it('round-trips the canonical config and both exact expected failures', () => {
    expect(
      publishSchedulerConfigContract.output.decode(
        publishSchedulerConfigContract.output.encode(config),
      ),
    ).toEqual({ kind: 'valid', value: config });

    const failures = [
      {
        kind: 'validation' as const,
        classification: 'semantic' as const,
        code: 'scheduler_config_invalid' as const,
        message: 'Scheduler values must be positive.' as const,
        safeMessage: 'Scheduler values must be positive.' as const,
      },
      {
        kind: 'conflict' as const,
        code: 'production_idempotency_conflict' as const,
        message:
          'The idempotency key belongs to a different production command.' as const,
        safeMessage:
          'The idempotency key belongs to a different production command.' as const,
      },
    ];
    for (const failure of failures)
      expect(
        publishSchedulerConfigContract.failure.decode(
          publishSchedulerConfigContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });

  it('fails closed when an application success violates the canonical result', () => {
    try {
      publishSchedulerConfigContract.output.encode({
        ...config,
        stageFitAssertion: {
          ...config.stageFitAssertion,
          washingFits: false,
        },
      } as unknown as SchedulerConfig);
      expect.unreachable('Invalid output must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_api_success_response',
        status: 500,
      });
    }
  });
});
