import { describe, expect, it } from 'vitest';
import {
  resolveChangeOrderResolutionReplay,
  serializeChangeOrderResolutionWorkEventCommand,
} from './idempotency.ts';
import type { ChangeOrderResolutionWorkEventCommand } from './execute.ts';

const command = {
  operation: 'production_order_resolved_without_production' as const,
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order' as const,
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 4,
  payload: {
    action: 'resolve_without_production' as const,
    reason: 'order_will_not_be_produced',
    note: null,
    confirmReviewedFacts: false,
    sourceStatePrecondition: {
      commercialState: 'open' as const,
      admissionState: 'unreleased' as const,
    },
  },
};
const storedResult = {
  locationId: command.locationId,
  orderId: command.target.entityId,
  action: 'resolve_without_production',
  resolutionState: 'resolved_without_production',
  transitionedAt: '2026-08-21T15:00:00.000Z',
  version: 5,
  replayed: false,
} as const;

describe('change order resolution idempotency', () => {
  it('serializes both review and trusted source-state identity', () => {
    expect(serializeChangeOrderResolutionWorkEventCommand(command)).toEqual({
      operation: command.operation,
      locationId: command.locationId,
      actorId: command.actorId,
      target: command.target,
      expectedVersion: 4,
      payload: command.payload,
    });
  });

  it('replays one valid identical command and marks it replayed', () => {
    expect(
      resolveChangeOrderResolutionReplay(
        {
          valid: true,
          command: serializeChangeOrderResolutionWorkEventCommand(command),
          result: { ...storedResult },
        },
        command,
      ),
    ).toEqual({
      kind: 'replay',
      result: { ...storedResult, replayed: true },
    });
    expect(resolveChangeOrderResolutionReplay(null, command)).toEqual({
      kind: 'miss',
    });
  });

  it('rejects a malformed historical result before replay', () => {
    expect(
      resolveChangeOrderResolutionReplay(
        {
          valid: false,
          command: serializeChangeOrderResolutionWorkEventCommand(command),
          result: {},
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it.each([
    {
      name: 'reason',
      different: {
        ...command,
        payload: { ...command.payload, reason: 'other' },
      },
    },
    {
      name: 'review confirmation',
      different: {
        ...command,
        payload: { ...command.payload, confirmReviewedFacts: true },
      },
    },
    {
      name: 'source precondition',
      different: {
        ...command,
        payload: {
          action: command.payload.action,
          reason: command.payload.reason,
          note: command.payload.note,
          confirmReviewedFacts: command.payload.confirmReviewedFacts,
        },
      },
    },
  ] satisfies readonly Readonly<{
    name: string;
    different: ChangeOrderResolutionWorkEventCommand;
  }>[])('rejects a different $name', ({ different }) => {
    expect(
      resolveChangeOrderResolutionReplay(
        {
          valid: true,
          command: serializeChangeOrderResolutionWorkEventCommand(different),
          result: { ...storedResult },
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
