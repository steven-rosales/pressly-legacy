import { proveOperation } from '@pressly/testkit/operation-proof';
import { publishSchedulerConfigCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import {
  decidePublishSchedulerConfig,
  publishSchedulerConfigOperationId,
} from './decide.ts';
import type { PublishSchedulerConfigCommand } from './types.ts';

const command = (
  overrides: Partial<PublishSchedulerConfigCommand> = {},
): PublishSchedulerConfigCommand => ({
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  },
  idempotencyKey: 'scheduler-config-command-1',
  ...overrides,
});

describe('publish scheduler config decision', () => {
  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'owns the stable operation identity and fixed current algorithm',
        proves: ['decision'],
        run: () => {
          expect(publishSchedulerConfigOperationId).toBe(
            'production.publish-scheduler-config.v1',
          );
          expect(decidePublishSchedulerConfig(command())).toEqual({
            kind: 'publish',
            config: {
              pulseMinutes: 56,
              foldLbsPerFolderMinute: 2,
              algorithmVersion: 'fixed-pulse-ffd-v2',
              stageFitAssertion: {
                sortingFits: true,
                washingFits: true,
                dryingFits: true,
              },
            },
          });
        },
      },
    ],
  });

  it.each([
    { pulseMinutes: 0 },
    { pulseMinutes: -1 },
    { foldLbsPerFolderMinute: 0 },
    { foldLbsPerFolderMinute: -0.5 },
  ])('rejects non-positive scheduler values: %o', (override) => {
    expect(decidePublishSchedulerConfig(command(override))).toEqual({
      kind: 'reject',
      failure: {
        kind: 'validation',
        classification: 'semantic',
        code: 'scheduler_config_invalid',
        message: 'Scheduler values must be positive.',
        safeMessage: 'Scheduler values must be positive.',
      },
    });
  });
});
