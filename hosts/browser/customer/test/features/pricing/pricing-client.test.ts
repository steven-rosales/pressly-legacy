import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Web Pricing topology binding', () => {
  it('binds public Pricing metadata without duplicating an API route', () => {
    const binding = read('../../../../../../topology/browser/customer.ts');
    const operations = read('../../../../../../topology/browser-operations.ts');
    const server = read('../../../src/composition/customer-pricing.server.ts');
    const queries = read(
      '../../../../../../experiences/customer/src/web/features/pricing/queries.ts',
    );

    expect(operations).toContain('pricingLoadPricingCatalogV1');
    expect(binding).toContain(
      "customerBrowserOperations['pricing.load-pricing-catalog.v1']",
    );
    expect(binding).toContain('makeCustomerPricingBrowserClient({');
    expect(server).toContain("next: { revalidate: 3600, tags: ['pricing'] }");
    expect(`${binding}\n${server}\n${queries}`).not.toContain(
      '/pricing/services/',
    );
    expect(queries).toContain('dependencies.query.run({');
    expect(queries).not.toContain('dependencies.query.fetch({');
  });

  it('keeps Docker static-only and runtime fallback decisions unchanged', () => {
    const server = read('../../../src/composition/customer-pricing.server.ts');
    const queries = read(
      '../../../../../../experiences/customer/src/web/features/pricing/queries.ts',
    );
    const fallback = read(
      '../../../../../../experiences/customer/src/web/features/pricing/static-catalog.ts',
    );

    expect(server).toContain(
      "staticOnly: process.env['PRESSLY_DOCKER_BUILD'] === 'true'",
    );
    expect(queries).toContain("source: 'static-fallback'");
    expect(fallback).toContain('washFoldPerLbCents: 167');
    expect(fallback).toContain('deliveryFeeCents: 0');
    expect(fallback).toContain('hangDryCents: 295');
  });
});
