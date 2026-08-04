export type ProductionChangeConnectionState =
  | 'connecting'
  | 'open'
  | 'reconnecting';

export type ProductionChangePort = Readonly<{
  subscribe: (input: {
    locationId: string;
    onInvalidate: (input: {
      source: 'ready' | 'change' | 'resync';
      revision: number | null;
    }) => void;
    onStateChange?: (state: ProductionChangeConnectionState) => void;
  }) => () => void;
}>;
