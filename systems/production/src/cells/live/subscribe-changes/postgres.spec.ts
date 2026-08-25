import type { PostgresRuntime } from '@pressly/postgres/client';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import {
  makePostgresProductionChangeFeed,
  parseProductionChangeNotification,
} from './postgres.ts';

describe('production change PostgreSQL feed', () => {
  it('accepts only bounded notification values', () => {
    expect(
      parseProductionChangeNotification(
        JSON.stringify({ locationId: 'east', revision: 7 }),
      ),
    ).toEqual({ locationId: 'east', revision: 7 });
    expect(parseProductionChangeNotification('{bad-json')).toBeNull();
    expect(
      parseProductionChangeNotification(
        JSON.stringify({ locationId: '', revision: 7 }),
      ),
    ).toBeNull();
    expect(
      parseProductionChangeNotification(
        JSON.stringify({ locationId: 'east', revision: -1 }),
      ),
    ).toBeNull();
    expect(
      parseProductionChangeNotification(
        JSON.stringify({ locationId: 'x'.repeat(201), revision: 1 }),
      ),
    ).toBeNull();
  });

  it('starts one listener, fans out by location, resyncs, and shuts down', async () => {
    let notify: ((payload: string) => void) | undefined;
    let connected: (() => void) | undefined;
    const stop = vi.fn(async () => undefined);
    const listen = vi.fn(
      async (
        _channel: string,
        listener: (payload: string) => void,
        onConnected?: () => void,
      ) => {
        notify = listener;
        connected = onConnected;
        onConnected?.();
        return stop;
      },
    );
    const failure = vi.fn();
    const resync = vi.fn();
    const feed = makePostgresProductionChangeFeed({
      database: {
        listen,
        db: {} as never,
        check: vi.fn(),
        close: vi.fn(),
      } as PostgresRuntime<Record<string, never>>,
      schema: productionTestSchema,
      observation: { failure, resync },
    });
    const east = vi.fn();
    const west = vi.fn();
    feed.subscribe('east', east);
    feed.subscribe('west', west);

    await Promise.all([feed.start(), feed.start()]);
    expect(listen).toHaveBeenCalledOnce();
    notify?.(JSON.stringify({ locationId: 'east', revision: 8 }));
    expect(east).toHaveBeenCalledWith({ kind: 'revision', revision: 8 });
    expect(west).not.toHaveBeenCalled();

    connected?.();
    expect(resync).toHaveBeenCalledWith('database_listener_reconnected');
    expect(east).toHaveBeenLastCalledWith({ kind: 'resync' });
    expect(west).toHaveBeenLastCalledWith({ kind: 'resync' });

    notify?.('{invalid');
    expect(failure).toHaveBeenCalledWith('invalid_notification', undefined);

    await feed.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(east).toHaveBeenLastCalledWith({ kind: 'shutdown' });
    expect(west).toHaveBeenLastCalledWith({ kind: 'shutdown' });
  });

  it('isolates a failing subscriber from healthy subscribers', async () => {
    let notify: ((payload: string) => void) | undefined;
    const failure = vi.fn();
    const feed = makePostgresProductionChangeFeed({
      database: {
        listen: async (
          _channel: string,
          listener: (payload: string) => void,
        ) => {
          notify = listener;
          return async () => undefined;
        },
        db: {} as never,
        check: vi.fn(),
        close: vi.fn(),
      } as PostgresRuntime<Record<string, never>>,
      schema: productionTestSchema,
      observation: { failure, resync: vi.fn() },
    });
    const healthy = vi.fn();
    feed.subscribe('east', () => {
      throw unexpectedError({
        code: 'production_change_test_subscriber_failed',
        message: 'Subscriber failure test fixture.',
      });
    });
    feed.subscribe('east', healthy);

    await feed.start();
    notify?.(JSON.stringify({ locationId: 'east', revision: 9 }));

    expect(healthy).toHaveBeenCalledWith({ kind: 'revision', revision: 9 });
    expect(failure).toHaveBeenCalledWith(
      'subscriber_failure',
      expect.objectContaining({
        code: 'production_change_test_subscriber_failed',
      }),
    );
    await feed.close();
  });

  it('reads the Production-owned revision from the local projection', async () => {
    const limit = vi.fn(async () => [{ revision: 12 }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const feed = makePostgresProductionChangeFeed({
      database: {
        listen: vi.fn(),
        db: { select } as never,
        check: vi.fn(),
        close: vi.fn(),
      } as PostgresRuntime<Record<string, never>>,
      schema: productionTestSchema,
    });

    await expect(feed.currentRevision('east')).resolves.toBe(12);
    expect(select).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith(productionTestSchema.productionLocations);
  });
});
