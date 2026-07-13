import { describe, expect, it } from 'vitest';
import {
  ingestWebhookEventCommandSchema,
  sourceLocationBindingsManifestSchema,
} from '../src/webhook-ingestion/webhook-ingestion.contracts.ts';

const hash = 'a'.repeat(64);

const event = {
  source: 'cents',
  eventType: 'order.updated',
  deduplicationKey: hash,
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-12T14:00:00.000Z',
  payload: { order: { id: 'order-1' } },
  rawBodySha256: hash,
  disposition: 'process',
} as const;

describe('webhook ingestion contracts', () => {
  it('accepts a source-neutral processable event', () => {
    expect(ingestWebhookEventCommandSchema.parse(event)).toEqual(event);
  });

  it('requires canonical payload only when an event will be processed', () => {
    expect(
      ingestWebhookEventCommandSchema.safeParse({ ...event, payload: null })
        .success,
    ).toBe(false);
    expect(
      ingestWebhookEventCommandSchema.safeParse({
        ...event,
        subjectType: 'customer',
        payload: null,
        disposition: 'ignore',
      }).success,
    ).toBe(true);
  });

  it('rejects malformed durable identities and undeclared fields', () => {
    expect(
      ingestWebhookEventCommandSchema.safeParse({
        ...event,
        deduplicationKey: 'delivery-1',
      }).success,
    ).toBe(false);
    expect(
      ingestWebhookEventCommandSchema.safeParse({
        ...event,
        vendor: 'cents',
      }).success,
    ).toBe(false);
  });

  it('keys source-location bindings by source and external location', () => {
    const binding = {
      source: 'cents',
      externalLocationId: 'store-1',
      locationId: 'location-1',
      isActive: true,
    } as const;

    expect(
      sourceLocationBindingsManifestSchema.safeParse({
        sourceLocationBindings: [binding],
      }).success,
    ).toBe(true);
    expect(
      sourceLocationBindingsManifestSchema.safeParse({
        sourceLocationBindings: [binding, binding],
      }).success,
    ).toBe(false);
  });

  it('accepts an empty binding manifest as a non-destructive no-op', () => {
    expect(
      sourceLocationBindingsManifestSchema.parse({
        sourceLocationBindings: [],
      }),
    ).toEqual({ sourceLocationBindings: [] });
  });
});
