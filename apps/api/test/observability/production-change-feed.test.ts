import { nullCounterSink } from '@pressly/metrics';
import { nullLogger } from '@pressly/logging';
import { describe, expect, it, vi } from 'vitest';
import {
  makePostgresProductionChangeFeed,
  parseProductionChangeNotification,
} from '../../src/common/live/production-change-feed.ts';

describe('production change feed', () => {
  it('accepts only bounded internal notification shapes', () => {
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

  it('fans revisions out by location and requests a resync after LISTEN reconnects', async () => {
    let notify: ((payload: string) => void) | undefined;
    let onListen: (() => void) | undefined;
    const unlisten = vi.fn(async () => undefined);
    const database = {
      listen: vi.fn(async (_channel, listener, connected) => {
        notify = listener;
        onListen = connected;
        connected?.();
        return unlisten;
      }),
      db: {} as never,
      check: vi.fn(),
      close: vi.fn(),
    };
    const feed = makePostgresProductionChangeFeed({
      database,
      logger: nullLogger,
      counters: nullCounterSink,
    });
    const east = vi.fn();
    const west = vi.fn();
    feed.subscribe('east', east);
    feed.subscribe('west', west);

    await feed.start();
    notify?.(JSON.stringify({ locationId: 'east', revision: 8 }));
    expect(east).toHaveBeenCalledWith({ kind: 'revision', revision: 8 });
    expect(west).not.toHaveBeenCalled();

    onListen?.();
    expect(east).toHaveBeenLastCalledWith({ kind: 'resync' });
    expect(west).toHaveBeenLastCalledWith({ kind: 'resync' });

    await feed.close();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(east).toHaveBeenLastCalledWith({ kind: 'shutdown' });
    expect(west).toHaveBeenLastCalledWith({ kind: 'shutdown' });
  });

  it('starts one database listener and isolates a failing subscriber', async () => {
    let notify: ((payload: string) => void) | undefined;
    const listen = vi.fn(async (_channel, listener) => {
      notify = listener;
      return async () => undefined;
    });
    const increment = vi.fn();
    const feed = makePostgresProductionChangeFeed({
      database: {
        listen,
        db: {} as never,
        check: vi.fn(),
        close: vi.fn(),
      },
      logger: nullLogger,
      counters: { increment },
    });
    const healthy = vi.fn();
    feed.subscribe('east', () => {
      throw new Error('closed response');
    });
    feed.subscribe('east', healthy);

    await Promise.all([feed.start(), feed.start()]);
    expect(listen).toHaveBeenCalledOnce();
    notify?.(JSON.stringify({ locationId: 'east', revision: 9 }));

    expect(healthy).toHaveBeenCalledWith({ kind: 'revision', revision: 9 });
    expect(increment).toHaveBeenCalledWith('api.sse_feed_failures', {
      reason: 'subscriber_failure',
    });
    await feed.close();
  });
});
