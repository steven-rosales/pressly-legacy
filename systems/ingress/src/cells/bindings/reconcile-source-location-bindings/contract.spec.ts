import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { reconcileSourceLocationBindingsContract } from './contract.ts';
import { reconcileSourceLocationBindingsCellDeclaration } from './cell.ts';

const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

proveOperation({
  operationId: 'ingress.reconcile-source-location-bindings.v1',
  declaration: reconcileSourceLocationBindingsCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the immutable manifest and declarative reconciliation result',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(reconcileSourceLocationBindingsContract, {
          manifest: { sourceLocationBindings: [binding] },
          dryRun: true,
        });
        expectIngressRoundTrip(reconcileSourceLocationBindingsContract.output, {
          mode: 'apply',
          status: 'converged',
          applied: true,
          operations: [
            {
              source: binding.source,
              externalLocationId: binding.externalLocationId,
              locationId: binding.locationId,
              outcome: 'created',
            },
          ],
          rejections: [],
        });
      },
    },
  ],
});
