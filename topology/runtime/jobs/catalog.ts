import {
  defineJobCatalog,
  type ExecutableCell,
  type ExecutableJobCatalog,
} from '@pressly/cells';
import type { ApiTargetOwners } from '../http/bootstrap/target-owners.js';

type JobCatalogOwners = Readonly<{
  'system:ingress': ApiTargetOwners['systems']['ingress'];
  'system:production': ApiTargetOwners['systems']['production'];
}>;

export const makeJobCatalogFromOwners = (
  owners: JobCatalogOwners,
): ExecutableJobCatalog =>
  defineJobCatalog([
    owners['system:ingress'].cells.processInboundEvent,
    owners['system:production'].cells.applyFulfillmentDemand,
  ] as readonly ExecutableCell[]);
