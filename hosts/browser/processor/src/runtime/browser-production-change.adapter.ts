import type {
  DescribeSubscribeChangesEventSource,
  ProductionChangePort,
} from '@pressly/topology/browser';

type EventSourceLike = Readonly<{
  addEventListener: (
    type: string,
    listener: (event: MessageEvent<string> | Event) => void,
  ) => void;
  close: () => void;
}>;

export type EventSourceFactory = (
  url: string,
  options: EventSourceInit,
) => EventSourceLike;

const revisionFrom = (event: MessageEvent<string> | Event): number | null => {
  if (!(event instanceof MessageEvent)) return null;
  try {
    const value: unknown = JSON.parse(event.data);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return null;
    const revision = Reflect.get(value, 'revision');
    return typeof revision === 'number' &&
      Number.isSafeInteger(revision) &&
      revision >= 0
      ? revision
      : null;
  } catch {
    return null;
  }
};

export const makeBrowserProductionChangeAdapter = (input: {
  apiBaseUrl: string;
  describeSubscription: DescribeSubscribeChangesEventSource;
  eventSourceFactory?: EventSourceFactory;
}): ProductionChangePort => ({
  subscribe: ({ locationId, onInvalidate, onStateChange }) => {
    const eventSourceFactory = input.eventSourceFactory ?? null;
    if (eventSourceFactory === null) return () => undefined;

    onStateChange?.('connecting');
    const subscription = input.describeSubscription({
      apiBaseUrl: input.apiBaseUrl,
      locationId,
    });
    const source = eventSourceFactory(subscription.url, {
      withCredentials: true,
    });
    const [readyEventType, changeEventType, resyncEventType] =
      subscription.eventTypes;

    source.addEventListener('open', () => onStateChange?.('open'));
    source.addEventListener('error', () => onStateChange?.('reconnecting'));
    source.addEventListener(readyEventType, (event) =>
      onInvalidate({ source: 'ready', revision: revisionFrom(event) }),
    );
    source.addEventListener(changeEventType, (event) => {
      const revision = revisionFrom(event);
      if (revision !== null) onInvalidate({ source: 'change', revision });
    });
    source.addEventListener(resyncEventType, () =>
      onInvalidate({ source: 'resync', revision: null }),
    );

    return () => source.close();
  },
});
