import { describe, expect, it } from 'vitest';
import { makeBrowserLocationPreferenceAdapter } from '../../../src/runtime/browser-location-preference.adapter.ts';
import { browserStorageFixture } from '../../support/browser-storage.fixture.ts';

describe('processor location preference', () => {
  it('persists only the selected non-secret location identifier', () => {
    const preference = makeBrowserLocationPreferenceAdapter(
      browserStorageFixture(localStorage),
    );
    preference.save('plant-east');
    expect(preference.read()).toBe('plant-east');
    expect(Object.keys(localStorage)).toEqual(['pressly.processor.location']);
    preference.clear();
    expect(preference.read()).toBeNull();
  });
});
