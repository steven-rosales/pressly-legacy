import type { ManageProductionResourcesFailure } from './manage-production-resources.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ProductionBootstrapCommand,
  ProductionBootstrapManifest,
  ProductionBootstrapResult,
} from './manage-production-resources.model.ts';

export type StoredProductionResources = Readonly<{
  location: ProductionBootstrapManifest['location'] | null;
  stations: readonly ProductionBootstrapManifest['stations'][number][];
  machines: readonly ProductionBootstrapManifest['machines'][number][];
  schedulerConfig: ProductionBootstrapManifest['schedulerConfig'] | null;
}>;

export type ManageProductionResources = (
  command: ProductionBootstrapCommand,
) => Promise<
  Result<ProductionBootstrapResult, ManageProductionResourcesFailure>
>;

export type ManageProductionResourcesRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadResources: (locationId: string) => Promise<StoredProductionResources>;
    applyResources: (input: {
      manifest: ProductionBootstrapManifest;
      result: ProductionBootstrapResult;
      actorId: string;
      idempotencyKey: string;
      idempotency: WorkEventCommandIdentity;
      now: Date;
    }) => Promise<void>;
  }>
>;
