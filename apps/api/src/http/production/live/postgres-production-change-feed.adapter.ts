import { type DatabaseRuntime } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import type { Logger } from '@pressly/logging';
import {
  attemptObservation,
  isolateCounterSink,
  type CounterSink,
} from '@pressly/observability';

export const productionChangeChannel = 'pressly_production_changes';

export type ProductionChange =
  | Readonly<{ kind: 'revision'; revision: number }>
  | Readonly<{ kind: 'resync' }>
  | Readonly<{ kind: 'shutdown' }>;

export type ProductionChangeFeed = Readonly<{
  start: () => Promise<void>;
  currentRevision: (locationId: string) => Promise<number | null>;
  subscribe: (
    locationId: string,
    listener: (change: ProductionChange) => void,
  ) => () => void;
  close: () => Promise<void>;
}>;

type ProductionChangeNotification = Readonly<{
  locationId: string;
  revision: number;
}>;

export const parseProductionChangeNotification = (
  payload: string,
): ProductionChangeNotification | null => {
  try {
    const value: unknown = JSON.parse(payload);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return null;

    const locationId = Reflect.get(value, 'locationId');
    const revision = Reflect.get(value, 'revision');
    if (
      typeof locationId !== 'string' ||
      locationId.length === 0 ||
      locationId.length > 200 ||
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      return null;

    return { locationId, revision };
  } catch {
    return null;
  }
};

export const makePostgresProductionChangeFeed = (input: {
  database: DatabaseRuntime;
  logger: Logger;
  counters: CounterSink;
}): ProductionChangeFeed => {
  const subscribers = new Map<
    string,
    Set<(change: ProductionChange) => void>
  >();
  let stopListening: (() => Promise<void>) | null = null;
  let startPromise: Promise<void> | null = null;
  let connected = false;
  const { increment } = isolateCounterSink(input.counters);
  const logWarn: Logger['warn'] = (message, fields) => {
    attemptObservation(() => input.logger.warn(message, fields));
  };

  const publish = (locationId: string, change: ProductionChange): void => {
    for (const listener of subscribers.get(locationId) ?? []) {
      try {
        listener(change);
      } catch (error: unknown) {
        increment('api.sse_feed_failures', {
          reason: 'subscriber_failure',
        });
        logWarn('production change subscriber failed', {
          error: normalizeUnknownError(error),
        });
      }
    }
  };

  const resyncAll = (): void => {
    for (const locationId of subscribers.keys())
      publish(locationId, { kind: 'resync' });
  };

  return {
    start: async () => {
      if (stopListening !== null) return;
      if (startPromise !== null) return startPromise;
      startPromise = input.database
        .listen(
          productionChangeChannel,
          (payload) => {
            const notification = parseProductionChangeNotification(payload);
            if (notification === null) {
              increment('api.sse_feed_failures', {
                reason: 'invalid_notification',
              });
              logWarn('production change notification rejected', {
                reason: 'invalid_notification',
              });
              return;
            }
            publish(notification.locationId, {
              kind: 'revision',
              revision: notification.revision,
            });
          },
          () => {
            if (connected) {
              increment('api.sse_resyncs', {
                reason: 'database_listener_reconnected',
              });
              resyncAll();
            }
            connected = true;
          },
        )
        .then((stop) => {
          stopListening = stop;
        })
        .finally(() => {
          startPromise = null;
        });
      return startPromise;
    },

    currentRevision: async (locationId) => {
      const [location] = await input.database.db
        .select({
          revision: laundryProduction.productionLocations.liveRevision,
        })
        .from(laundryProduction.productionLocations)
        .where(eq(laundryProduction.productionLocations.id, locationId))
        .limit(1);
      return location?.revision ?? null;
    },

    subscribe: (locationId, listener) => {
      const locationSubscribers = subscribers.get(locationId) ?? new Set();
      locationSubscribers.add(listener);
      subscribers.set(locationId, locationSubscribers);
      return () => {
        locationSubscribers.delete(listener);
        if (locationSubscribers.size === 0) subscribers.delete(locationId);
      };
    },

    close: async () => {
      if (startPromise !== null)
        try {
          await startPromise;
        } catch {
          // The caller that started the feed owns the startup failure. Close is
          // still responsible for releasing any partially-created lifecycle.
        }
      const stop = stopListening;
      stopListening = null;
      connected = false;
      for (const locationId of subscribers.keys())
        publish(locationId, { kind: 'shutdown' });
      subscribers.clear();
      if (stop !== null) await stop();
    },
  };
};
