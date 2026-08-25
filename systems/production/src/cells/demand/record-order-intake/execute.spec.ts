import { proveOperation } from '@pressly/testkit/operation-proof';
import { recordOrderIntakeCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteRecordOrderIntake } from './execute.ts';
import {
  recordOrderIntakeIdempotency,
  serializeRecordOrderIntakeWorkEventCommand,
  type StoredRecordOrderIntakeWorkEvent,
} from './idempotency.ts';
import type { RecordOrderIntakeFacts } from './types.ts';

const now = new Date('2026-08-21T15:00:00.000Z');
const command = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  bagCount: 3,
  expectedVersion: 2,
  idempotencyKey: 'record-intake-command-1',
};
const facts: RecordOrderIntakeFacts = {
  productionOrderId: command.productionOrderId,
  productionStatus: 'intake_pending',
  productionVersion: 2,
  intakeVersion: 1,
  derivedWeightLbs: 25,
  demandPhase: 'production_released',
  admissionOverride: null,
  executionStatus: 'unassigned',
  resolutionState: 'open',
};
const eventCommand = {
  operation: 'production_order_intake_recorded' as const,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order' as const,
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: { bagCount: command.bagCount },
};
const mutation = {
  locationId: command.locationId,
  orderId: command.productionOrderId,
  bagCount: 3,
  bagCountProvenance: 'operator_intake' as const,
  intakeVersion: 2,
  version: 3,
  replayed: false,
};

describe('execute record order intake', () => {
  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves replay, lock, CAS, bag mutation, and audit order',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const operations = {
            findWorkEvent: vi.fn(async () => {
              calls.push('findWorkEvent');
              return null;
            }),
            lockLocationScheduling: vi.fn(async () => {
              calls.push('lockLocationScheduling');
            }),
            lockOrder: vi.fn(async () => {
              calls.push('lockOrder');
              return facts;
            }),
            recordIntake: vi.fn(async () => {
              calls.push('recordIntake');
              return mutation;
            }),
            appendWorkEvent: vi.fn(async () => {
              calls.push('appendWorkEvent');
            }),
          };
          const execute =
            makeExecuteRecordOrderIntake<StoredRecordOrderIntakeWorkEvent>({
              repo: { transaction: async (work) => work(operations) },
              idempotency: recordOrderIntakeIdempotency,
              policy: productionRules,
              clock: { now: () => now },
            });

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: mutation,
          });
          expect(calls).toEqual([
            'findWorkEvent',
            'lockLocationScheduling',
            'findWorkEvent',
            'lockOrder',
            'recordIntake',
            'appendWorkEvent',
          ]);
          expect(operations.recordIntake).toHaveBeenCalledWith({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            bagCount: 3,
            expectedVersion: 2,
            currentIntakeVersion: 1,
            nextStatus: 'eligible',
            now,
          });
          expect(operations.appendWorkEvent).toHaveBeenCalledWith({
            locationId: command.locationId,
            eventType: 'production_order_intake_recorded',
            entityType: 'production_order',
            entityId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: 2,
            idempotencyKey: command.idempotencyKey,
            payload: {
              bagCount: 3,
              bagCountProvenance: 'operator_intake',
              intakeVersion: 2,
              version: 3,
            },
            idempotency: { command: eventCommand, result: mutation },
          });
        },
      },
    ],
  });

  it('replays an identical receipt before either lock', async () => {
    const lockLocationScheduling = vi.fn();
    const lockOrder = vi.fn();
    const recordIntake = vi.fn();
    const appendWorkEvent = vi.fn();
    const execute = makeExecuteRecordOrderIntake({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: serializeRecordOrderIntakeWorkEventCommand(eventCommand),
              result: { ...mutation },
            }),
            lockLocationScheduling,
            lockOrder,
            recordIntake,
            appendWorkEvent,
          }),
      },
      idempotency: recordOrderIntakeIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: { ...mutation, replayed: true },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
    expect(lockOrder).not.toHaveBeenCalled();
    expect(recordIntake).not.toHaveBeenCalled();
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rejects divergent reuse before the location lock', async () => {
    const lockLocationScheduling = vi.fn();
    const execute = makeExecuteRecordOrderIntake({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: serializeRecordOrderIntakeWorkEventCommand({
                ...eventCommand,
                payload: { bagCount: 2 },
              }),
              result: { ...mutation },
            }),
            lockLocationScheduling,
            lockOrder: vi.fn(),
            recordIntake: vi.fn(),
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: recordOrderIntakeIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
  });

  it('returns the exact late production-version CAS conflict', async () => {
    const appendWorkEvent = vi.fn();
    const execute =
      makeExecuteRecordOrderIntake<StoredRecordOrderIntakeWorkEvent>({
        repo: {
          transaction: async (work) =>
            work({
              findWorkEvent: async () => null,
              lockLocationScheduling: async () => undefined,
              lockOrder: async () => facts,
              recordIntake: async () => null,
              appendWorkEvent,
            }),
        },
        idempotency: recordOrderIntakeIdempotency,
        policy: productionRules,
        clock: { now: () => now },
      });

    await expect(execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_order_version_conflict',
        message: 'The production order changed before intake was recorded.',
        safeMessage: 'The production order changed before intake was recorded.',
      },
    });
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('returns policy rejection before mutation', async () => {
    const recordIntake = vi.fn();
    const appendWorkEvent = vi.fn();
    const execute =
      makeExecuteRecordOrderIntake<StoredRecordOrderIntakeWorkEvent>({
        repo: {
          transaction: async (work) =>
            work({
              findWorkEvent: async () => null,
              lockLocationScheduling: async () => undefined,
              lockOrder: async () => ({
                ...facts,
                resolutionState: 'resolved_without_production',
              }),
              recordIntake,
              appendWorkEvent,
            }),
        },
        idempotency: recordOrderIntakeIdempotency,
        policy: productionRules,
        clock: { now: () => now },
      });
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_resolved' },
    });
    expect(recordIntake).not.toHaveBeenCalled();
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('maps unexpected repository faults through Errors ownership', async () => {
    const execute =
      makeExecuteRecordOrderIntake<StoredRecordOrderIntakeWorkEvent>({
        repo: { transaction: async () => Promise.reject('database offline') },
        idempotency: recordOrderIntakeIdempotency,
        policy: productionRules,
        clock: { now: () => now },
      });
    await expect(execute(command)).rejects.toMatchObject({
      code: 'production_intake_failed',
      status: 503,
    });
  });
});
