import type {
  ControlLocationAccess,
  EffectiveControlGrant,
} from '../../language/control-access/control-access.model.ts';

export type ControlAccessStore = Readonly<{
  loadEffectiveGrants: (input: {
    identityId: string;
    now: Date;
  }) => Promise<readonly EffectiveControlGrant[]>;
  listActiveLocations: (
    businessId: string,
  ) => Promise<readonly ControlLocationAccess[]>;
}>;
