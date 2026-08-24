import { proveOperation } from '@pressly/testkit/operation-proof';
import { setOrderPriorityCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteSetOrderPriority } from './execute.ts';
import {
  setOrderPriorityIdempotency,
  serializeSetOrderPriorityWorkEventCommand,
  type StoredSetOrderPriorityWorkEvent,
} from './idempotency.ts';

const command = {
  locationId: 'location-1',
  productionOrderId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  priority: true,
  expectedVersion: 2,
  idempotencyKey: 'priority-command-1',
} as const;

describe('execute set order priority', () => {
  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves the required lock, mutation, and audit order',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const mutation = {
            entityId: command.productionOrderId,
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
            lockPriorityOrder: vi.fn(async () => {
              calls.push('lockPriorityOrder');
              return {
                productionOrderId: command.productionOrderId,
                version: 2,
                resolutionState: 'open',
              };
            }),
            setOrderPriority: vi.fn(async () => {
              calls.push('setOrderPriority');
              return mutation;
            }),
            appendWorkEvent: vi.fn(async () => {
              calls.push('appendWorkEvent');
            }),
          };
          const execute =
            makeExecuteSetOrderPriority<StoredSetOrderPriorityWorkEvent>({
              repo: { transaction: async (work) => work(operations) },
              idempotency: setOrderPriorityIdempotency,
              policy: productionRules,
              clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
            });

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: mutation,
          });
          expect(calls).toEqual([
            'findWorkEvent',
            'lockLocationScheduling',
            'findWorkEvent',
            'lockPriorityOrder',
            'setOrderPriority',
            'appendWorkEvent',
          ]);
          expect(operations.appendWorkEvent).toHaveBeenCalledWith({
            locationId: command.locationId,
            eventType: 'production_order_priority_changed',
            entityType: 'production_order',
            entityId: command.productionOrderId,
            actorId: command.actorId,
            expectedVersion: command.expectedVersion,
            idempotencyKey: command.idempotencyKey,
            payload: { priority: true, version: 3 },
            idempotency: {
              command: {
                operation: 'production_order_priority_changed',
                locationId: command.locationId,
                actorId: command.actorId,
                target: {
                  entityType: 'production_order',
                  entityId: command.productionOrderId,
                },
                expectedVersion: 2,
                payload: { priority: true },
              },
              result: mutation,
            },
          });
        },
      },
    ],
  });

  it('replays the exact command before acquiring either lock', async () => {
    const eventCommand = {
      operation: 'production_order_priority_changed' as const,
      locationId: command.locationId,
      actorId: command.actorId,
      target: {
        entityType: 'production_order' as const,
        entityId: command.productionOrderId,
      },
      expectedVersion: command.expectedVersion,
      payload: { priority: command.priority },
    };
    const lockLocationScheduling = vi.fn();
    const lockPriorityOrder = vi.fn();
    const setOrderPriority = vi.fn();
    const appendWorkEvent = vi.fn();
    const execute = makeExecuteSetOrderPriority({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: serializeSetOrderPriorityWorkEventCommand(eventCommand),
              result: {
                entityId: command.productionOrderId,
                version: 3,
                replayed: false,
              },
            }),
            lockLocationScheduling,
            lockPriorityOrder,
            setOrderPriority,
            appendWorkEvent,
          }),
      },
      idempotency: setOrderPriorityIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        entityId: command.productionOrderId,
        version: 3,
        replayed: true,
      },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
    expect(lockPriorityOrder).not.toHaveBeenCalled();
    expect(setOrderPriority).not.toHaveBeenCalled();
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rejects a divergent command that reuses the same idempotency key', async () => {
    const lockLocationScheduling = vi.fn();
    const execute = makeExecuteSetOrderPriority({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: {
                operation: 'production_order_priority_changed',
                locationId: command.locationId,
                actorId: command.actorId,
                target: {
                  entityType: 'production_order',
                  entityId: command.productionOrderId,
                },
                expectedVersion: command.expectedVersion,
                payload: { priority: false },
              },
              result: {
                entityId: command.productionOrderId,
                version: 3,
                replayed: false,
              },
            }),
            lockLocationScheduling,
            lockPriorityOrder: vi.fn(),
            setOrderPriority: vi.fn(),
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: setOrderPriorityIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
    });

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(lockLocationScheduling).not.toHaveBeenCalled();
  });

  it('returns a typed conflict when the version or open-resolution compare-and-swap loses after locking', async () => {
    const appendWorkEvent = vi.fn();
    const execute =
      makeExecuteSetOrderPriority<StoredSetOrderPriorityWorkEvent>({
        repo: {
          transaction: async (work) =>
            work({
              findWorkEvent: async () => null,
              lockLocationScheduling: async () => undefined,
              lockPriorityOrder: async () => ({
                productionOrderId: command.productionOrderId,
                version: 2,
                resolutionState: 'open',
              }),
              setOrderPriority: async () => null,
              appendWorkEvent,
            }),
        },
        idempotency: setOrderPriorityIdempotency,
        policy: productionRules,
        clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
      });

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_version_conflict' },
    });
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });

  it('maps unexpected repository faults through Errors ownership', async () => {
    const execute =
      makeExecuteSetOrderPriority<StoredSetOrderPriorityWorkEvent>({
        repo: {
          transaction: async () => Promise.reject('database offline'),
        },
        idempotency: setOrderPriorityIdempotency,
        policy: productionRules,
        clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
      });

    await expect(execute(command)).rejects.toMatchObject({
      code: 'production_priority_failed',
      status: 503,
    });
  });
});
