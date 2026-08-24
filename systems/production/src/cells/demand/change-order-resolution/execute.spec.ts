import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeOrderResolutionCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteChangeOrderResolution } from './execute.ts';
import {
  changeOrderResolutionIdempotency,
  serializeChangeOrderResolutionWorkEventCommand,
  type StoredChangeOrderResolutionWorkEvent,
} from './idempotency.ts';
import type {
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionFacts,
  ChangeOrderResolutionResult,
} from './types.ts';

const now = new Date('2026-08-21T15:00:00.000Z');
const command: ChangeOrderResolutionCommand = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  action: 'resolve_without_production',
  reason: 'processor_not_in_use',
  note: null,
  confirmReviewedFacts: false,
  expectedVersion: 4,
  idempotencyKey: 'resolve-order-command-1',
};
const facts: ChangeOrderResolutionFacts = {
  productionOrderId: command.productionOrderId,
  productionVersion: 4,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  demandPhase: 'expected',
  sourceDueAt: new Date('2026-08-22T20:00:00.000Z'),
  sourceEstimatedWeightLbs: 24,
  sourceEstimatedWeightSource: 'external_estimate',
  admissionOverride: null,
  bagCount: null,
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasHistoricalPlanSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
};
const eventCommand = {
  operation: 'production_order_resolved_without_production' as const,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order' as const,
    entityId: command.productionOrderId,
  },
  expectedVersion: 4,
  payload: {
    action: 'resolve_without_production' as const,
    reason: 'processor_not_in_use',
    note: null,
    confirmReviewedFacts: false,
  },
};
const mutation = {
  locationId: command.locationId,
  orderId: command.productionOrderId,
  action: 'resolve_without_production' as const,
  resolutionState: 'resolved_without_production' as const,
  transitionedAt: now.toISOString(),
  version: 5,
  replayed: false,
};

const executeWith = (input: {
  findWorkEvent?: () => Promise<StoredChangeOrderResolutionWorkEvent | null>;
  lockOrder?: () => Promise<ChangeOrderResolutionFacts | null>;
  changeResolution?: () => Promise<ChangeOrderResolutionResult | null>;
  appendWorkEvent?: () => Promise<void>;
}) => {
  const calls: string[] = [];
  const operations = {
    findWorkEvent: vi.fn(async () => {
      calls.push('findWorkEvent');
      return (await input.findWorkEvent?.()) ?? null;
    }),
    lockLocationScheduling: vi.fn(async () => {
      calls.push('lockLocationScheduling');
    }),
    lockOrder: vi.fn(async () => {
      calls.push('lockOrder');
      return input.lockOrder === undefined ? facts : input.lockOrder();
    }),
    changeResolution: vi.fn(async () => {
      calls.push('changeResolution');
      return input.changeResolution === undefined
        ? mutation
        : input.changeResolution();
    }),
    appendWorkEvent: vi.fn(async () => {
      calls.push('appendWorkEvent');
      await input.appendWorkEvent?.();
    }),
  };
  return {
    calls,
    operations,
    execute:
      makeExecuteChangeOrderResolution<StoredChangeOrderResolutionWorkEvent>({
        repo: { transaction: async (work) => work(operations) },
        idempotency: changeOrderResolutionIdempotency,
        policy: productionRules,
        clock: { now: () => now },
      }),
  };
};

describe('execute change order resolution', () => {
  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves two replay checks, lock order, CAS, and exact resolve event',
        proves: ['executor-success'],
        run: async () => {
          const harness = executeWith({});
          await expect(harness.execute(command)).resolves.toEqual({
            kind: 'success',
            value: mutation,
          });
          expect(harness.calls).toEqual([
            'findWorkEvent',
            'lockLocationScheduling',
            'findWorkEvent',
            'lockOrder',
            'changeResolution',
            'appendWorkEvent',
          ]);
          expect(harness.operations.changeResolution).toHaveBeenCalledWith({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: 4,
            lifecycle: { from: 'open', state: 'resolved_without_production' },
            reason: 'processor_not_in_use',
            note: null,
            clearPendingPlacement: false,
            restoredSourceProjection: null,
            now,
          });
          expect(harness.operations.appendWorkEvent).toHaveBeenCalledWith({
            locationId: command.locationId,
            eventType: 'production_order_resolved_without_production',
            entityType: 'production_order',
            entityId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: 4,
            idempotencyKey: command.idempotencyKey,
            payload: {
              action: 'resolve_without_production',
              from: 'open',
              resolutionState: 'resolved_without_production',
              reason: 'processor_not_in_use',
              note: null,
              reviewReasons: [],
              clearedPendingPlacement: false,
              version: 5,
            },
            idempotency: { command: eventCommand, result: mutation },
          });
        },
      },
    ],
  });

  it('replays before the location lock', async () => {
    const harness = executeWith({
      findWorkEvent: async () => ({
        valid: true,
        command: serializeChangeOrderResolutionWorkEventCommand(eventCommand),
        result: { ...mutation },
      }),
    });
    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'success',
      value: { ...mutation, replayed: true },
    });
    expect(harness.calls).toEqual(['findWorkEvent']);
  });

  it('replays a command that commits while waiting for the location lock', async () => {
    let checks = 0;
    const harness = executeWith({
      findWorkEvent: async () =>
        checks++ === 0
          ? null
          : {
              valid: true,
              command:
                serializeChangeOrderResolutionWorkEventCommand(eventCommand),
              result: { ...mutation },
            },
    });
    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'success',
      value: { ...mutation, replayed: true },
    });
    expect(harness.calls).toEqual([
      'findWorkEvent',
      'lockLocationScheduling',
      'findWorkEvent',
    ]);
  });

  it('rejects divergent reuse before mutation', async () => {
    const harness = executeWith({
      findWorkEvent: async () => ({
        valid: true,
        command: serializeChangeOrderResolutionWorkEventCommand({
          ...eventCommand,
          payload: { ...eventCommand.payload, reason: 'duplicate_or_test' },
        }),
        result: { ...mutation },
      }),
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(harness.operations.changeResolution).not.toHaveBeenCalled();
  });

  it('returns policy and late CAS conflicts without an event', async () => {
    const blocked = executeWith({
      lockOrder: async () => ({ ...facts, hasBatchMembership: true }),
    });
    await expect(blocked.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_resolution_blocked' },
    });
    expect(blocked.operations.changeResolution).not.toHaveBeenCalled();

    const late = executeWith({ changeResolution: async () => null });
    await expect(late.execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_order_version_conflict',
        message:
          'The order changed before its archive status was updated. Refresh and try again.',
        safeMessage:
          'The order changed before its archive status was updated. Refresh and try again.',
      },
    });
    expect(late.operations.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('records the exact restored source projection', async () => {
    const restored = {
      ...mutation,
      action: 'restore' as const,
      resolutionState: 'open' as const,
    };
    const harness = executeWith({
      lockOrder: async () => ({
        ...facts,
        resolutionState: 'resolved_without_production',
        sourceAdmissionState: 'released',
        demandPhase: 'production_released',
        bagCount: 2,
      }),
      changeResolution: async () => restored,
    });
    const restore: ChangeOrderResolutionCommand = {
      locationId: command.locationId,
      productionOrderId: command.productionOrderId,
      actorId: command.actorId,
      action: 'restore',
      reason: 'work_should_be_produced',
      note: null,
      expectedVersion: command.expectedVersion,
      idempotencyKey: 'restore-order-command-1',
    };

    await expect(harness.execute(restore)).resolves.toMatchObject({
      kind: 'success',
      value: { action: 'restore', resolutionState: 'open' },
    });
    expect(harness.operations.changeResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: { from: 'resolved_without_production', state: 'open' },
        restoredSourceProjection: {
          dueAt: facts.sourceDueAt,
          derivedWeightLbs: 24,
          derivedWeightSource: 'external_estimate',
          operationalStatus: 'eligible',
          clearAdmissionOverride: true,
        },
      }),
    );
    expect(harness.operations.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_order_restored',
        payload: expect.objectContaining({
          restoredSourceProjection: {
            dueAt: facts.sourceDueAt.toISOString(),
            derivedWeightLbs: 24,
            operationalStatus: 'eligible',
          },
        }),
      }),
    );
  });

  it('maps unexpected repository faults through Errors ownership', async () => {
    const execute =
      makeExecuteChangeOrderResolution<StoredChangeOrderResolutionWorkEvent>({
        repo: { transaction: async () => Promise.reject('database offline') },
        idempotency: changeOrderResolutionIdempotency,
        policy: productionRules,
        clock: { now: () => now },
      });
    await expect(execute(command)).rejects.toMatchObject({
      code: 'production_order_resolution_change_failed',
      status: 503,
    });
  });
});
