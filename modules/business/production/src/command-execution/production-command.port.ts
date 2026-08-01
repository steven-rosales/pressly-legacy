export type ClockPort = Readonly<{ now: () => Date }>;
export type IdPort = Readonly<{ next: () => string }>;

export type WorkEventCommandIdentity = Readonly<{
  operation: string;
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: string;
    entityId: string | null;
  }>;
  expectedVersion: number | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type StoredWorkEvent = Readonly<{
  command: unknown;
  result: unknown;
  valid: boolean;
}>;

export type FindWorkEvent = (
  idempotencyKey: string,
) => Promise<StoredWorkEvent | null>;

export type WorkEventInput = Readonly<{
  locationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion?: number;
  idempotencyKey: string;
  payload?: Readonly<Record<string, unknown>>;
  idempotency: Readonly<{
    command: WorkEventCommandIdentity;
    result: Readonly<Record<string, unknown>>;
  }>;
}>;
