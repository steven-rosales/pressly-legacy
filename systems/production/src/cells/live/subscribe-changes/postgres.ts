import type { PostgresRuntime, PostgresSchema } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type {
  ProductionChangeFeed,
  ProductionChangeSourceEvent,
} from './types.ts';

export const productionChangeChannel = 'pressly_production_changes';

export type ProductionChangeFeedFailureReason =
  | 'invalid_notification'
  | 'subscriber_failure';

export type ProductionChangeFeedObservation = Readonly<{
  failure: (reason: ProductionChangeFeedFailureReason, error?: unknown) => void;
  resync: (reason: 'database_listener_reconnected') => void;
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

export const makePostgresProductionChangeFeed = <
  Schema extends PostgresSchema,
>(input: {
  database: PostgresRuntime<Schema>;
  schema: Pick<ProductionSchema, 'productionLocations'>;
  observation?: ProductionChangeFeedObservation;
}): ProductionChangeFeed => {
  const subscribers = new Map<
    string,
    Set<(event: ProductionChangeSourceEvent) => void>
  >();
  let stopListening: (() => Promise<void>) | null = null;
  let startPromise: Promise<void> | null = null;
  let connected = false;

  const observeFailure = (
    reason: ProductionChangeFeedFailureReason,
    error?: unknown,
  ): void => {
    try {
      input.observation?.failure(reason, error);
    } catch {
      // Telemetry is deliberately isolated from the live state signal.
    }
  };

  const publish = (
    locationId: string,
    event: ProductionChangeSourceEvent,
  ): void => {
    for (const listener of subscribers.get(locationId) ?? [])
      try {
        listener(event);
      } catch (error: unknown) {
        observeFailure('subscriber_failure', error);
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
              observeFailure('invalid_notification');
              return;
            }
            publish(notification.locationId, {
              kind: 'revision',
              revision: notification.revision,
            });
          },
          () => {
            if (connected) {
              try {
                input.observation?.resync('database_listener_reconnected');
              } catch {
                // Telemetry is deliberately isolated from resynchronization.
              }
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
        .select({ revision: input.schema.productionLocations.liveRevision })
        .from(input.schema.productionLocations)
        .where(eq(input.schema.productionLocations.id, locationId))
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
          // The starter owns startup failure; close still releases lifecycle.
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
