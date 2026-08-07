import type {
  ControlLocationAccess,
  EffectiveControlGrant,
} from '../../../foundations/language/control-access/control-access.model.ts';

export type ResolveControlAccessRepository = Readonly<{
  loadEffectiveGrants: (input: {
    identityId: string;
    now: Date;
  }) => Promise<readonly EffectiveControlGrant[]>;
  listActiveLocations: (
    businessId: string,
  ) => Promise<readonly ControlLocationAccess[]>;
}>;
