import { describe, expect, it } from 'vitest';
import {
  resolvePublishSchedulerConfigReplay,
  serializePublishSchedulerConfigWorkEventCommand,
} from './idempotency.ts';
import type { PublishSchedulerConfigWorkEventCommand } from './execute.ts';
import type { SchedulerConfig } from './types.ts';

const actorId = '10000000-0000-4000-8000-000000000001';

const command: PublishSchedulerConfigWorkEventCommand = {
  operation: 'scheduler_config_published',
  locationId: 'location-1',
  actorId,
  target: { entityType: 'scheduler_config', entityId: null },
  expectedVersion: null,
  payload: {
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
};

const config: SchedulerConfig = {
  id: '10000000-0000-4000-8000-000000000002',
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 1,
  stageFitAssertion: {
    ...command.payload.stageFitAssertion,
    assertedBy: actorId,
    assertedAt: '2026-08-22T14:00:00.000Z',
  },
  publishedAt: '2026-08-22T14:00:00.000Z',
};

describe('publish scheduler config idempotency', () => {
  it('serializes the stable identity including stage fit and null target/version', () => {
    expect(serializePublishSchedulerConfigWorkEventCommand(command)).toEqual({
      operation: 'scheduler_config_published',
      locationId: 'location-1',
      actorId,
      target: { entityType: 'scheduler_config', entityId: null },
      expectedVersion: null,
      payload: {
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
      },
    });
  });

  it('distinguishes miss, exact replay, malformed receipt, and divergent reuse', () => {
    expect(resolvePublishSchedulerConfigReplay(null, command)).toEqual({
      kind: 'miss',
    });
    expect(
      resolvePublishSchedulerConfigReplay(
        {
          command: serializePublishSchedulerConfigWorkEventCommand(command),
          result: config,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result: config });
    expect(
      resolvePublishSchedulerConfigReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });

    for (const divergent of [
      {
        ...serializePublishSchedulerConfigWorkEventCommand(command),
        actorId: '10000000-0000-4000-8000-000000000009',
      },
      {
        ...serializePublishSchedulerConfigWorkEventCommand(command),
        locationId: 'location-2',
      },
      {
        ...serializePublishSchedulerConfigWorkEventCommand(command),
        payload: {
          ...command.payload,
          foldLbsPerFolderMinute: 3,
        },
      },
    ])
      expect(
        resolvePublishSchedulerConfigReplay(
          { command: divergent, result: config, valid: true },
          command,
        ),
      ).toEqual({ kind: 'conflict' });
  });
});
