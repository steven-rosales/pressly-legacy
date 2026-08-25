import { describe, expect, it } from 'vitest';

import {
  businessScope,
  globalScope,
  locationScope,
  resourceScope,
  scopeCovers,
  scopeKey,
} from './public.ts';

describe('scopeKey', () => {
  it('builds stable keys for each scope kind', () => {
    expect(scopeKey(globalScope())).toBe('global:*');
    expect(scopeKey(businessScope('pressly'))).toBe('business:pressly');
    expect(scopeKey(locationScope('hoboken'))).toBe('location:hoboken');
    expect(scopeKey(resourceScope('pricing.catalog', 'catalog_1'))).toBe(
      'resource:pricing.catalog:catalog_1',
    );
  });
});

describe('scopeCovers', () => {
  it('lets global assignments cover every scope', () => {
    expect(scopeCovers(globalScope(), locationScope('hoboken'))).toBe(true);
    expect(
      scopeCovers(globalScope(), resourceScope('pricing.catalog', 'catalog_1')),
    ).toBe(true);
  });

  it('matches location assignments only to the same location', () => {
    expect(
      scopeCovers(locationScope('hoboken'), locationScope('hoboken')),
    ).toBe(true);
    expect(
      scopeCovers(locationScope('hoboken'), locationScope('jersey-city')),
    ).toBe(false);
  });

  it('matches business assignments only to the same business', () => {
    expect(
      scopeCovers(businessScope('pressly'), businessScope('pressly')),
    ).toBe(true);
    expect(
      scopeCovers(businessScope('pressly'), businessScope('another-business')),
    ).toBe(false);
    expect(
      scopeCovers(businessScope('pressly'), locationScope('pressly-one')),
    ).toBe(false);
  });

  it('matches resource assignments only to the same resource type and id', () => {
    expect(
      scopeCovers(
        resourceScope('pricing.catalog', 'catalog_1'),
        resourceScope('pricing.catalog', 'catalog_1'),
      ),
    ).toBe(true);
    expect(
      scopeCovers(
        resourceScope('pricing.catalog', 'catalog_1'),
        resourceScope('pricing.catalog', 'catalog_2'),
      ),
    ).toBe(false);
    expect(
      scopeCovers(
        resourceScope('pricing.catalog', 'catalog_1'),
        resourceScope('order', 'catalog_1'),
      ),
    ).toBe(false);
  });

  it('does not let location assignments cover resource scopes', () => {
    expect(
      scopeCovers(
        locationScope('hoboken'),
        resourceScope('pricing.catalog', 'catalog_1'),
      ),
    ).toBe(false);
  });
});
