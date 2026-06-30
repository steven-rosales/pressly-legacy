import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineEvent } from '../src/product-event.js';

describe('defineEvent', () => {
  it('creates a versioned product event', () => {
    const event = defineEvent('schedule_clicked')({
      source: 'hero',
    });

    assert.deepEqual(event, {
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

    assert.equal(event.schemaVersion, 2);
  });
});
