import { describe, expect, it } from 'vitest';
import { canonicalCustomerDisplayName } from '../../../../src/foundations/language/operational-order/operational-order.value.ts';

describe('operational order values', () => {
  it('prefers a normalized business name and otherwise joins personal names', () => {
    expect(
      canonicalCustomerDisplayName({
        businessName: '  Northwind   Hotel ',
        firstName: 'Ignored',
        lastName: 'Person',
      }),
    ).toBe('Northwind Hotel');
    expect(
      canonicalCustomerDisplayName({
        businessName: null,
        firstName: ' Ada ',
        lastName: ' Lovelace ',
      }),
    ).toBe('Ada Lovelace');
  });
});
