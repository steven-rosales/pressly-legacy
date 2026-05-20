import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePricingCliCommand } from './args.ts';

describe('parsePricingCliCommand', () => {
  it('parses a pricing show command', () => {
    const result = parsePricingCliCommand([
      '--',
      'pricing',
      'show',
      '--service',
      'wash-fold',
      '--location',
      'hoboken',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'show');
      assert.equal(result.value.serviceSlug, 'wash-fold');
      assert.equal(result.value.locationSlug, 'hoboken');
    }
  });

  it('parses repeated pricing change items', () => {
    const result = parsePricingCliCommand([
      'pricing',
      'plan',
      '--service',
      'dry-cleaning',
      '--set',
      'delivery_fee=4.95',
      '--set',
      'shirt=2.50',
      '--reason',
      'Update tested CLI pricing',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'plan');
      assert.equal(result.value.items.length, 2);
      assert.deepEqual(result.value.items[0], {
        code: 'delivery_fee',
        priceCents: 495,
      });
      assert.deepEqual(result.value.items[1], {
        code: 'shirt',
        priceCents: 250,
      });
    }
  });

  it('requires explicit confirmation for publish at run time only', () => {
    const result = parsePricingCliCommand([
      'pricing',
      'publish',
      '--service',
      'wash-fold',
      '--set',
      'delivery_fee=4.95',
      '--reason',
      'Update tested CLI pricing',
    ]);

    assert.equal(result.ok, true);

    if (result.ok && result.value !== 'help') {
      assert.equal(result.value.action, 'publish');
      assert.equal(result.value.confirm, false);
    }
  });
});
