import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import {
  makeCustomerPricingBrowserClient,
  type CustomerPricingOperation,
} from '../../src/browser.ts';

const operation = Object.freeze({
  operationId: 'pricing.load-pricing-catalog.v1',
  contract: Object.freeze({
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  }),
  http: Object.freeze({
    pricing: Object.freeze({
      method: 'GET',
      path: '/pricing/services/:serviceSlug/pricing',
    }),
  }),
}) satisfies CustomerPricingOperation;

const fault = unexpectedError({
  code: 'customer_pricing_browser_fault_fixture',
  message: 'Customer Pricing browser fault fixture.',
});

describe('Customer Pricing browser client', () => {
  it('renders declared metadata and preserves transport failure identity', async () => {
    const request = vi.fn().mockRejectedValue(fault);
    const client = makeCustomerPricingBrowserClient({ operation, request });

    await expect(client.loadCatalog('wash-fold')).rejects.toBe(fault);
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'GET',
      path: '/pricing/services/wash-fold/pricing',
    });
  });

  it('returns strict serialized Pricing owner values without Date conversion', async () => {
    const serialized = {
      serviceSlug: 'dry-cleaning',
      currency: 'USD',
      items: [
        {
          service: 'dry_cleaning',
          unit: 'item',
          category: 'Garments',
          name: 'Shirt',
          priceCents: 625,
          sortOrder: 100,
          metadata: {},
        },
      ],
      updatedAt: '2026-08-22T12:00:00.000Z',
    } as const;
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized);
      if (decoded.kind === 'invalid') throw fault;
      return decoded.value;
    });
    const client = makeCustomerPricingBrowserClient({ operation, request });

    const result = await client.loadCatalog('dry-cleaning');

    expect(result).toEqual(serialized);
    expect(result.updatedAt).toBe(serialized.updatedAt);

    request.mockImplementationOnce(async (_request, codec) => {
      const decoded = codec.decode({ ...serialized, leaked: true });
      if (decoded.kind === 'invalid') throw fault;
      return decoded.value;
    });
    await expect(client.loadCatalog('dry-cleaning')).rejects.toBe(fault);
  });
});
