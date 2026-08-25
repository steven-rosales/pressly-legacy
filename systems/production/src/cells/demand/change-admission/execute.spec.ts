import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeAdmissionCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteChangeAdmission } from './execute.ts';
import {
  changeAdmissionIdempotency,
  serializeChangeAdmissionWorkEventCommand,
  type StoredChangeAdmissionWorkEvent,
} from './idempotency.ts';
import type { ChangeAdmissionFacts } from './types.ts';

const now = new Date('2026-08-21T15:00:00.000Z');
const command = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  target: 'released' as const,
  expectedVersion: 2,
  idempotencyKey: 'change-admission-command-1',
};

const facts: ChangeAdmissionFacts = {
  productionOrderId: command.productionOrderId,
  sourceAdmissionState: 'unreleased',
  productionStatus: 'release_pending',
  productionVersion: 2,
  executionStatus: 'unassigned',
  derivedWeightLbs: 25,
  admissionOverride: null,
  bagCount: 1,
  selectedForShift: false,
  hasActivePlacement: false,
  resolutionState: 'open',
};

const eventCommand = {
  operation: 'production_admission_changed' as const,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order' as const,
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: { target: command.target },
};

describe('execute change admission', () => {
  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves replay, location lock, row lock, CAS, and audit order',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const mutation = {
            locationId: command.locationId,
            orderId: command.productionOrderId,
            admissionOverride: 'released' as const,
            status: 'eligible' as const,
            version: 3,
            replayed: false,
          };
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
            changeAdmission: vi.fn(async () => {
              calls.push('changeAdmission');
              return mutation;
            }),
            appendWorkEvent: vi.fn(async () => {
              calls.push('appendWorkEvent');
            }),
          };
          const execute =
            makeExecuteChangeAdmission<StoredChangeAdmissionWorkEvent>({
              repo: { transaction: async (work) => work(operations) },
              idempotency: changeAdmissionIdempotency,
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
            'changeAdmission',
            'appendWorkEvent',
          ]);
          expect(operations.changeAdmission).toHaveBeenCalledWith({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: command.expectedVersion,
            admissionOverride: 'released',
            nextStatus: 'eligible',
            now,
          });
          expect(operations.appendWorkEvent).toHaveBeenCalledWith({
            locationId: command.locationId,
            eventType: 'production_admission_changed',
            entityType: 'production_order',
            entityId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: command.expectedVersion,
            idempotencyKey: command.idempotencyKey,
            payload: {
              target: 'released',
              sourceAdmissionState: 'unreleased',
              admissionOverride: 'released',
              status: 'eligible',
              version: 3,
            },
            idempotency: { command: eventCommand, result: mutation },
          });
        },
      },
    ],
  });

  it('replays an identical receipt before acquiring either lock', async () => {
    const lockLocationScheduling = vi.fn();
    const lockOrder = vi.fn();
    const changeAdmission = vi.fn();
    const appendWorkEvent = vi.fn();
    const execute = makeExecuteChangeAdmission({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: serializeChangeAdmissionWorkEventCommand(eventCommand),
              result: {
                locationId: command.locationId,
                orderId: command.productionOrderId,
                admissionOverride: 'released',
                status: 'eligible',
                version: 3,
                replayed: false,
              },
            }),
            lockLocationScheduling,
            lockOrder,
            changeAdmission,
            appendWorkEvent,
          }),
      },
      idempotency: changeAdmissionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        locationId: command.locationId,
        orderId: command.productionOrderId,
        admissionOverride: 'released',
        status: 'eligible',
        version: 3,
        replayed: true,
      },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
    expect(lockOrder).not.toHaveBeenCalled();
    expect(changeAdmission).not.toHaveBeenCalled();
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rejects divergent idempotency reuse before acquiring the scheduling lock', async () => {
    const lockLocationScheduling = vi.fn();
    const execute = makeExecuteChangeAdmission({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: serializeChangeAdmissionWorkEventCommand({
                ...eventCommand,
                payload: { target: 'source' },
              }),
              result: {
                locationId: command.locationId,
                orderId: command.productionOrderId,
                admissionOverride: 'released',
                status: 'eligible',
                version: 3,
                replayed: false,
              },
            }),
            lockLocationScheduling,
            lockOrder: vi.fn(),
            changeAdmission: vi.fn(),
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: changeAdmissionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
  });

  it('returns the exact late compare-and-swap conflict without appending an event', async () => {
    const appendWorkEvent = vi.fn();
    const execute = makeExecuteChangeAdmission<StoredChangeAdmissionWorkEvent>({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => null,
            lockLocationScheduling: async () => undefined,
            lockOrder: async () => facts,
            changeAdmission: async () => null,
            appendWorkEvent,
          }),
      },
      idempotency: changeAdmissionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_order_version_conflict',
        message:
          'The order changed before its production admission was updated. Refresh and try again.',
        safeMessage:
          'The order changed before its production admission was updated. Refresh and try again.',
      },
    });
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('maps unexpected repository faults through Errors ownership', async () => {
    const execute = makeExecuteChangeAdmission<StoredChangeAdmissionWorkEvent>({
      repo: { transaction: async () => Promise.reject('database offline') },
      idempotency: changeAdmissionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });

    await expect(execute(command)).rejects.toMatchObject({
      code: 'production_admission_change_failed',
      status: 503,
    });
  });
});
