import type {
  ControlCapability,
  ControlSessionAssurance,
} from './control-access.value.ts';

export type ControlApplication = Readonly<{
  id: 'processor' | 'control';
  label: string;
  description: string;
  href: string;
}>;

export type ControlLocationAccess = Readonly<{
  id: string;
  name: string;
  timezone: string;
}>;

export type ControlAccess = Readonly<{
  business: Readonly<{ id: string; name: string }>;
  locations: readonly ControlLocationAccess[];
  selectedLocationId: string | null;
  capabilities: readonly ControlCapability[];
  applications: readonly ControlApplication[];
}>;

export type ControlAccessPrincipal = Readonly<{
  identityId: string;
  assuranceLevel: ControlSessionAssurance;
}>;

export type EffectiveControlGrant = Readonly<{
  businessId: string;
  businessName: string;
  role: string;
  scopeKind: string;
  scopeId: string;
}>;
