import type { JsonObject } from '@pressly/codec';

export type WorkEventCommandIdentity = Readonly<{
  operation: string;
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: string;
    entityId: string | null;
  }>;
  expectedVersion: number | null;
  payload: JsonObject;
}>;

export type StoredWorkEvent = Readonly<{
  command: JsonObject;
  result: JsonObject;
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
  payload?: JsonObject;
  idempotency: Readonly<{
    command: WorkEventCommandIdentity;
    result: JsonObject;
  }>;
}>;
