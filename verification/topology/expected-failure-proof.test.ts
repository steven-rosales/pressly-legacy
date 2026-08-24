import { describe, expect, it } from 'vitest';
import {
  missingExpectedFailureVariants,
  parseNamedExpectedFailureScenarios,
  selectExpectedFailureDiscriminant,
} from '../../topology/tooling/expected-failure-proof.ts';

describe('expected-failure semantic proof', () => {
  it('prefers the first finite semantic discriminant without collapsing an open diagnostic code', () => {
    expect(
      selectExpectedFailureDiscriminant([
        { field: 'code', values: null },
        { field: 'kind', values: ['diagnostic'] },
        { field: 'reason', values: ['fallback'] },
      ]),
    ).toEqual({ field: 'kind', values: ['diagnostic'] });
    expect(
      selectExpectedFailureDiscriminant([
        { field: 'code', values: null },
        { field: 'kind', values: null },
        {
          field: 'reason',
          values: ['upstream_production_query_failed'],
        },
      ]),
    ).toEqual({
      field: 'reason',
      values: ['upstream_production_query_failed'],
    });
    expect(
      selectExpectedFailureDiscriminant([
        { field: 'code', values: ['known_code'] },
        { field: 'kind', values: ['diagnostic'] },
      ]),
    ).toEqual({ field: 'code', values: ['known_code'] });
  });

  it('rejects an explicitly declared variant without a named executable assertion', () => {
    const scenarios = parseNamedExpectedFailureScenarios({
      path: 'systems/orders/src/cells/lifecycle/create-order/execute.spec.ts',
      source: `
        import { expect, it } from 'vitest';
        it('rejects a missing reference', async () => {
          const outcome = await execute();
          expect(outcome).toMatchObject({
            kind: 'failure',
            failure: { code: 'order_reference_not_found' },
          });
        });
      `,
    });

    expect(
      missingExpectedFailureVariants({
        variants: [
          { field: 'code', value: 'order_reference_not_found' },
          { field: 'code', value: 'order_idempotency_conflict' },
        ],
        scenarios,
      }),
    ).toEqual([{ field: 'code', value: 'order_idempotency_conflict' }]);
  });

  it('derives separately named executable scenarios from an inline table', () => {
    const scenarios = parseNamedExpectedFailureScenarios({
      path: 'systems/orders/src/cells/lifecycle/create-order/execute.spec.ts',
      source: `
        import { expect, it } from 'vitest';
        it.each([
          { name: 'missing reference', code: 'order_reference_not_found' },
          { name: 'conflicting key', code: 'order_idempotency_conflict' },
        ])('returns $name', async (testCase) => {
          const outcome = await execute();
          expect(outcome).toMatchObject({ failure: { code: testCase.code } });
        });
      `,
    });

    expect(
      missingExpectedFailureVariants({
        variants: [
          { field: 'code', value: 'order_reference_not_found' },
          { field: 'code', value: 'order_idempotency_conflict' },
        ],
        scenarios,
      }),
    ).toEqual([]);
    expect(scenarios.map(({ name }) => name)).toEqual([
      'returns $name [missing reference]',
      'returns $name [conflicting key]',
    ]);
  });
});
