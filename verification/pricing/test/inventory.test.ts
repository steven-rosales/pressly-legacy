import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPricingCatalogCellDeclaration } from '@pressly/pricing-system/operations/catalog/load-pricing-catalog/cell';
import { planPricingChangeCellDeclaration } from '@pressly/pricing-system/operations/pricebook/plan-pricing-change/cell';
import { publishPricingChangeCellDeclaration } from '@pressly/pricing-system/operations/pricebook/publish-pricing-change/cell';
import { describe, expect, it } from 'vitest';
import {
  protectedPricingCatalogValues,
  pricingVerificationOperationIds,
} from '../src/public.ts';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const sourceFiles = (root: string): readonly string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));

describe('Pricing operation inventory', () => {
  it('selects all three owner cells into topology and generated catalogs', () => {
    const selected = [
      'topology/pressly.topology.ts',
      'generated/architecture-map.ts',
      'generated/http-catalog.ts',
      'generated/job-catalog.ts',
      'generated/event-stream-catalog.ts',
    ]
      .map(read)
      .join('\n');

    expect(selected).toContain('@pressly/pricing-system');
    for (const operationId of pricingVerificationOperationIds)
      expect(selected).toContain(operationId);
  });

  it('binds Web catalog reads through Customer generated metadata only', () => {
    const generated = read('generated/clients/customer.ts');
    const binding = read('generated/runtime/src/browser/customer.ts');
    const server = read(
      'hosts/browser/customer/src/composition/customer-pricing.server.ts',
    );
    const queries = read(
      'experiences/customer/src/web/features/pricing/queries.ts',
    );

    expect(generated).toContain(
      "operationId: 'pricing.load-pricing-catalog.v1'",
    );
    expect(binding).toContain('pricingLoadPricingCatalogV1');
    expect(binding).toContain('makeCustomerPricingBrowserClient({');
    expect(`${binding}\n${server}\n${queries}`).not.toContain(
      '/pricing/services/',
    );
    expect(server).toContain("next: { revalidate: 3600, tags: ['pricing'] }");
  });

  it('records exact public and protected boundary facts', () => {
    const providers = read(
      'topology/runtime/http/bootstrap/http-boundary-providers.ts',
    );
    const planHttp = read(
      'systems/pricing/src/cells/pricebook/plan-pricing-change/http.ts',
    );
    const publishHttp = read(
      'systems/pricing/src/cells/pricebook/publish-pricing-change/http.ts',
    );

    expect(providers).toContain("input.capability === 'pricing:plan'");
    expect(providers).toContain("input.capability === 'pricing:publish'");
    expect(providers).toContain("'pricing-change-author':");
    expect(providers).toContain('id: principal.identityId');
    expect(providers).toContain('kind: principal.kind');
    expect(providers).toContain('displayName: principal.displayName');
    for (const source of [planHttp, publishHttp]) {
      expect(source).toContain("bodyLimit: '16kb'");
      expect(source).toContain(
        "contextRequirements: ['pricing-change-author']",
      );
      expect(source).toContain('validateRequest:');
      expect(source).toContain('toSerializedInput:');
    }

    expect(loadPricingCatalogCellDeclaration).toMatchObject({
      authentication: 'none',
      authorization: null,
      surfaces: [
        {
          method: 'GET',
          path: '/pricing/services/:serviceSlug/pricing',
          bodyLimit: null,
        },
      ],
    });
    for (const declaration of [
      planPricingChangeCellDeclaration,
      publishPricingChangeCellDeclaration,
    ])
      expect(declaration).toMatchObject({
        authentication: 'required',
        authorization: { timing: 'after-input' },
        surfaces: [
          {
            method: 'POST',
            bodyLimit: '16kb',
            contextRequirements: ['pricing-change-author'],
          },
        ],
      });
  });

  it('keeps the database seed and Web fallback on the protected public values', () => {
    const seed = read('systems/pricing/src/seeding/seed-pricing.postgres.ts');
    const fallback = read(
      'experiences/customer/src/web/features/pricing/static-catalog.ts',
    );

    expect(protectedPricingCatalogValues).toEqual({
      databaseSeed: { deliveryFeeCents: 0, hangDryCents: 295 },
      webStaticFallback: { deliveryFeeCents: 0, hangDryCents: 295 },
    });
    expect(seed).toContain(
      "'delivery_fee', 'wash_fold', 'Fee', 'Delivery Fee', 'order', 0",
    );
    expect(seed).toContain(
      "'hang_dry', 'wash_fold', 'Other Services', 'Hang Dry', 'item', 295",
    );
    expect(seed).toContain(
      "'delivery_fee', 'dry_cleaning', 'Fee', 'Delivery Fee', 'order', 0",
    );
    expect(fallback).toContain('deliveryFeeCents: 0');
    expect(fallback).toContain('hangDryCents: 295');
  });

  it('contains no invented payment, Billing, Stripe, or peer-system authority', () => {
    const root = path.join(repositoryRoot, 'systems/pricing/src');
    const source = sourceFiles(root)
      .filter((file) => !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/stripe|payment|checkout|@pressly\/billing/iu);
    expect(source).not.toMatch(
      /@pressly\/(?:access-system|customers-system|orders-system|production-system)/u,
    );
  });
});
