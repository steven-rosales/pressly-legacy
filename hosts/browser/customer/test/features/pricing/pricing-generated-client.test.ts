import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Web generated Pricing client binding', () => {
  it('binds public Pricing metadata without a handwritten API route', () => {
    const binding = read(
      '../../../../../../generated/runtime/src/browser/customer.ts',
    );
    const server = read('../../../src/composition/customer-pricing.server.ts');
    const queries = read(
      '../../../../../../experiences/customer/src/web/features/pricing/queries.ts',
    );

    expect(binding).toContain('pricingLoadPricingCatalogV1');
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
