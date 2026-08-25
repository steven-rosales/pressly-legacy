import { describe, expect, it } from 'vitest';
import type { ManageResourcesWorkEventCommand } from './execute.ts';
import {
  resolveManageResourcesReplay,
  serializeManageResourcesResult,
  serializeManageResourcesWorkEventCommand,
} from './idempotency.ts';
import type { ManageResourcesResult } from './types.ts';

const command: ManageResourcesWorkEventCommand = {
  operation: 'production_resources_bootstrapped',
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_resource_manifest',
    entityId: 'location-1',
  },
  expectedVersion: null,
  payload: {
    dryRun: false,
    configurationHash: 'a'.repeat(64),
  },
};
const applied: ManageResourcesResult = {
  mode: 'apply',
  status: 'converged',
  configurationHash: 'a'.repeat(64),
  operations: [],
  rejections: [],
  summary: { created: 0, updated: 0, noop: 0, rejected: 0 },
  replayed: false,
  applied: true,
};

describe('manage resources idempotency', () => {
  it('serializes the exact work-event command and result receipt', () => {
    expect(serializeManageResourcesWorkEventCommand(command)).toEqual({
      operation: 'production_resources_bootstrapped',
      locationId: 'location-1',
      actorId: command.actorId,
      target: {
        entityType: 'production_resource_manifest',
        entityId: 'location-1',
      },
      expectedVersion: null,
      payload: {
        dryRun: false,
        configurationHash: 'a'.repeat(64),
      },
    });
    expect(serializeManageResourcesResult(applied)).toEqual(applied);
  });

  it('replays an identical decoded receipt', () => {
    expect(
      resolveManageResourcesReplay(
        {
          valid: true,
          command: serializeManageResourcesWorkEventCommand(command),
          result: applied,
        },
        command,
      ),
    ).toEqual({
      kind: 'replay',
      result: { ...applied, replayed: true },
    });
    expect(
      resolveManageResourcesReplay(
        {
          valid: false,
          command: serializeManageResourcesWorkEventCommand(command),
          result: {},
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it.each([
    {
      name: 'manifest hash',
      command: {
        ...command,
        payload: { ...command.payload, configurationHash: 'b'.repeat(64) },
      },
    },
    {
      name: 'actor',
      command: { ...command, actorId: 'different-actor' },
    },
    {
      name: 'operation',
      command: { ...command, locationId: 'different-location' },
    },
  ])('rejects a divergent $name', ({ command: different }) => {
    expect(
      resolveManageResourcesReplay(
        {
          valid: true,
          command: serializeManageResourcesWorkEventCommand(different),
          result: applied,
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
