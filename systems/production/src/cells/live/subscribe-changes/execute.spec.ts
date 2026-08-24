import { proveOperation } from '@pressly/testkit/operation-proof';
import { subscribeProductionChangesCellDeclaration } from './cell.ts';
import type { SubscriptionObserver } from '@pressly/cells';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeOpenProductionChanges } from './execute.ts';
import type {
  ProductionChangeEvent,
  ProductionChangeSource,
  ProductionChangeSourceEvent,
} from './types.ts';

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};

const observer = () => {
  const next = vi.fn<(event: ProductionChangeEvent) => void>();
  const close = vi.fn<() => void>();
  const error = vi.fn<(error: unknown) => void>();
  return {
    value: {
      next,
      close,
      error,
    } satisfies SubscriptionObserver<ProductionChangeEvent>,
    next,
    close,
    error,
  };
};

describe('open production change subscription', () => {
  proveOperation({
    operationId: 'production.subscribe-changes.v1',
    declaration: subscribeProductionChangesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'subscribes before reading the revision and closes the initial race',
        proves: ['executor-success'],
        run: async () => {
          const current = deferred<number | null>();
          const events: string[] = [];
          const unsubscribe = vi.fn();
          let publish:
            | ((event: ProductionChangeSourceEvent) => void)
            | undefined;
          const source: ProductionChangeSource = {
            subscribe: (_locationId, listener) => {
              events.push('subscribe');
              publish = listener;
              return unsubscribe;
            },
            currentRevision: () => {
              events.push('current-revision');
              return current.promise;
            },
          };
          const pending = makeOpenProductionChanges({ source })({
            locationId: 'east',
          });

          expect(events).toEqual(['subscribe', 'current-revision']);
          publish?.({ kind: 'revision', revision: 7 });
          publish?.({ kind: 'revision', revision: 9 });
          publish?.({ kind: 'revision', revision: 8 });
          current.resolve(8);

          const outcome = await pending;
          expect(outcome.kind).toBe('success');
          if (outcome.kind !== 'success') return;
          expect(outcome.value.ready).toEqual({ revision: 8 });

          const observed = observer();
          outcome.value.subscribe(observed.value);
          expect(observed.next).toHaveBeenCalledOnce();
          expect(observed.next).toHaveBeenCalledWith({
            kind: 'change',
            revision: 9,
          });

          await outcome.value.close();
          await outcome.value.close();
          expect(unsubscribe).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  it('gives a buffered reconnect-resync precedence over revisions', async () => {
    const current = deferred<number | null>();
    let publish: ((event: ProductionChangeSourceEvent) => void) | undefined;
    const source: ProductionChangeSource = {
      subscribe: (_locationId, listener) => {
        publish = listener;
        return () => undefined;
      },
      currentRevision: () => current.promise,
    };
    const pending = makeOpenProductionChanges({ source })({
      locationId: 'east',
    });
    publish?.({ kind: 'revision', revision: 10 });
    publish?.({ kind: 'resync' });
    current.resolve(8);

    const outcome = await pending;
    if (outcome.kind !== 'success') return;
    const observed = observer();
    outcome.value.subscribe(observed.value);

    expect(observed.next).toHaveBeenCalledOnce();
    expect(observed.next).toHaveBeenCalledWith({
      kind: 'resync',
      reason: 'upstream_reconnected',
    });
  });

  it('reports a shutdown received during the revision lookup before any ready event', async () => {
    const current = deferred<number | null>();
    let publish: ((event: ProductionChangeSourceEvent) => void) | undefined;
    const source: ProductionChangeSource = {
      subscribe: (_locationId, listener) => {
        publish = listener;
        return () => undefined;
      },
      currentRevision: () => current.promise,
    };
    const pending = makeOpenProductionChanges({ source })({
      locationId: 'east',
    });
    publish?.({ kind: 'shutdown' });
    current.resolve(8);

    const outcome = await pending;
    if (outcome.kind !== 'success') return;
    const observed = observer();
    outcome.value.subscribe(observed.value);

    expect(observed.close).toHaveBeenCalledOnce();
    expect(observed.next).not.toHaveBeenCalled();
  });

  it('forwards every ready-state change and closes on source shutdown', async () => {
    let publish: ((event: ProductionChangeSourceEvent) => void) | undefined;
    const source: ProductionChangeSource = {
      subscribe: (_locationId, listener) => {
        publish = listener;
        return () => undefined;
      },
      currentRevision: async () => 4,
    };
    const outcome = await makeOpenProductionChanges({ source })({
      locationId: 'east',
    });
    if (outcome.kind !== 'success') return;
    const observed = observer();
    outcome.value.subscribe(observed.value);

    publish?.({ kind: 'revision', revision: 5 });
    publish?.({ kind: 'revision', revision: 5 });
    publish?.({ kind: 'resync' });
    publish?.({ kind: 'shutdown' });

    expect(observed.next.mock.calls.map(([event]) => event)).toEqual([
      { kind: 'change', revision: 5 },
      { kind: 'change', revision: 5 },
      { kind: 'resync', reason: 'upstream_reconnected' },
    ]);
    expect(observed.close).toHaveBeenCalledOnce();
    expect(observed.error).not.toHaveBeenCalled();
  });

  it('unsubscribes for missing locations and lookup failures', async () => {
    const unsubscribeMissing = vi.fn();
    const missing = await makeOpenProductionChanges({
      source: {
        subscribe: () => unsubscribeMissing,
        currentRevision: async () => null,
      },
    })({ locationId: 'missing' });

    expect(missing).toEqual({
      kind: 'failure',
      failure: {
        kind: 'not_found',
        code: 'production_location_not_found',
        message: 'Production location missing was not found.',
        safeMessage: 'The production location was not found.',
      },
    });
    expect(unsubscribeMissing).toHaveBeenCalledOnce();

    const unsubscribeFailure = vi.fn();
    const failure = unexpectedError({
      code: 'production_change_test_database_unavailable',
      message: 'PostgresDatabase unavailable test fixture.',
    });
    const open = makeOpenProductionChanges({
      source: {
        subscribe: () => unsubscribeFailure,
        currentRevision: async () => {
          throw failure;
        },
      },
    });
    await expect(open({ locationId: 'east' })).rejects.toBe(failure);
    expect(unsubscribeFailure).toHaveBeenCalledOnce();
  });
});
