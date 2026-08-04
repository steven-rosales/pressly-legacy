import type { ProductionChangePort } from '@/ports/production-change.port';

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

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

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
  eventSourceFactory?: EventSourceFactory;
}): ProductionChangePort => ({
  subscribe: ({ locationId, onInvalidate, onStateChange }) => {
    const eventSourceFactory =
      input.eventSourceFactory ??
      (typeof EventSource === 'undefined'
        ? null
        : (url: string, options: EventSourceInit) =>
            new EventSource(url, options));
    if (eventSourceFactory === null) return () => undefined;

    onStateChange?.('connecting');
    const source = eventSourceFactory(
      joinUrl(
        input.apiBaseUrl,
        `/production/locations/${encodeURIComponent(locationId)}/events`,
      ),
      { withCredentials: true },
    );

    source.addEventListener('open', () => onStateChange?.('open'));
    source.addEventListener('error', () => onStateChange?.('reconnecting'));
    source.addEventListener('ready', (event) =>
      onInvalidate({ source: 'ready', revision: revisionFrom(event) }),
    );
    source.addEventListener('change', (event) => {
      const revision = revisionFrom(event);
      if (revision !== null) onInvalidate({ source: 'change', revision });
    });
    source.addEventListener('resync', () =>
      onInvalidate({ source: 'resync', revision: null }),
    );

    return () => source.close();
  },
});
