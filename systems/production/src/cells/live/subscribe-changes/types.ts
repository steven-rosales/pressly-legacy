export type SubscribeProductionChangesInput = Readonly<{
  locationId: string;
}>;

export type SubscribeProductionChangesReady = Readonly<{
  revision: number;
}>;

export type ProductionChangeEvent =
  | Readonly<{ kind: 'change'; revision: number }>
  | Readonly<{ kind: 'resync'; reason: 'upstream_reconnected' }>;

export type SubscribeProductionChangesFailure = Readonly<{
  kind: 'not_found';
  code: 'production_location_not_found';
  message: string;
  safeMessage: string;
}>;

export type ProductionChangeSourceEvent =
  | Readonly<{ kind: 'revision'; revision: number }>
  | Readonly<{ kind: 'resync' }>
  | Readonly<{ kind: 'shutdown' }>;

export type ProductionChangeSource = Readonly<{
  currentRevision: (locationId: string) => Promise<number | null>;
  subscribe: (
    locationId: string,
    listener: (event: ProductionChangeSourceEvent) => void,
  ) => () => void;
}>;

export type ProductionChangeFeed = ProductionChangeSource &
  Readonly<{
    start: () => Promise<void>;
    close: () => Promise<void>;
  }>;
