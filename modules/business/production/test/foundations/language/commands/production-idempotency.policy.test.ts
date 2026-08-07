import { describe, expect, it } from 'vitest';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../../src/foundations/language/commands/production-idempotency.policy.ts';

const command = defineWorkEventCommand({
  operation: 'production_order_priority_changed',
  locationId: 'location-1',
  actorId: '00000000-0000-4000-8000-000000000001',
  entityType: 'production_order',
  entityId: '00000000-0000-4000-8000-000000000002',
  expectedVersion: 3,
  payload: { priority: true, metadata: { source: 'operator' } },
});

const stored = {
  command,
  result: {
    entityId: '00000000-0000-4000-8000-000000000002',
    version: 4,
    replayed: false,
  },
  valid: true,
} as const;

describe('production work-event idempotency', () => {
  it('distinguishes a missing key from an exact lost-response replay', () => {
    expect(resolveWorkEventReplay(null, command)).toEqual({ tag: 'miss' });
    expect(resolveWorkEventReplay(stored, command)).toEqual({
      tag: 'replay',
      result: {
        entityId: '00000000-0000-4000-8000-000000000002',
        version: 4,
        replayed: true,
      },
    });
  });

  it('compares object keys canonically without weakening array ordering', () => {
    const reordered = defineWorkEventCommand({
      operation: command.operation,
      locationId: command.locationId,
      actorId: command.actorId,
      entityType: command.target.entityType,
      entityId: command.target.entityId,
      expectedVersion: command.expectedVersion,
      payload: { metadata: { source: 'operator' }, priority: true },
    });

    expect(resolveWorkEventReplay(stored, reordered).tag).toBe('replay');
  });

  it.each([
    ['operation', { ...command, operation: 'production_run_started' }],
    ['location', { ...command, locationId: 'location-2' }],
    ['actor', { ...command, actorId: '00000000-0000-4000-8000-000000000099' }],
    [
      'entity',
      {
        ...command,
        target: {
          ...command.target,
          entityId: '00000000-0000-4000-8000-000000000003',
        },
      },
    ],
    ['expected version', { ...command, expectedVersion: 4 }],
    ['payload', { ...command, payload: { priority: false } }],
  ])('rejects the same key for a different %s', (_name, different) => {
    expect(resolveWorkEventReplay(stored, different)).toEqual({
      tag: 'conflict',
    });
  });

  it('fails closed for a legacy or malformed work event', () => {
    expect(
      resolveWorkEventReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ tag: 'conflict' });
  });
});
