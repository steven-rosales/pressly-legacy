import type {
  OperationalOrderIdentityReference,
  OperationalOrderIdentityResolution,
} from '../../language/operational-order/operational-order.model.ts';

export type OperationalOrderIdentityPort = Readonly<{
  resolve: (
    references: readonly OperationalOrderIdentityReference[],
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentityResolution>>;
}>;
