import type {
  ProductionBootstrapInput,
  ProductionBootstrapManifest,
  ProductionBootstrapResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventCommandIdentity,
} from '../production.port.ts';

export type StoredProductionResources = Readonly<{
  location: ProductionBootstrapManifest['location'] | null;
  stations: readonly ProductionBootstrapManifest['stations'][number][];
  machines: readonly ProductionBootstrapManifest['machines'][number][];
  schedulerConfig: ProductionBootstrapManifest['schedulerConfig'] | null;
}>;

export type ManageProductionResources = (
  command: ProductionBootstrapInput & { actorId: string },
) => Promise<Result<ProductionBootstrapResult, AppError>>;

export type ManageProductionResourcesRepository = Transactional<
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
