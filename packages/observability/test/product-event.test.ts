import { describe, expect, it } from 'vitest';
import { defineEvent } from '../src/product-event.js';

describe('defineEvent', () => {
  it('creates a versioned product event', () => {
    const event = defineEvent('schedule_clicked')({
      source: 'hero',
    });

    expect(event).toEqual({
      name: 'schedule_clicked',
      schemaVersion: 1,
      properties: {
        source: 'hero',
      },
    });
  });

  it('supports explicit schema versions', () => {
    const event = defineEvent(
      'pricing_viewed',
      2,
    )({
      source: 'pricing',
    });

    expect(event.schemaVersion).toBe(2);
  });
});
