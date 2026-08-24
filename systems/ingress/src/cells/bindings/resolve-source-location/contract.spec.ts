import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { resolveSourceLocationContract } from './contract.ts';
import { resolveSourceLocationCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.resolve-source-location.v1',
  declaration: resolveSourceLocationCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns one source-scoped external identity lookup',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(resolveSourceLocationContract, {
          source: 'cents',
          externalLocationId: 'store-1',
        });
        expectIngressRoundTrip(
          resolveSourceLocationContract.output,
          'location-1',
        );
        expectIngressRoundTrip(resolveSourceLocationContract.output, null);
      },
    },
  ],
});
