import type { ControlCapability } from '@pressly/contracts';
import type { LoadedControlSession } from './control-session.port.ts';

export type EffectiveControlGrant = Readonly<{
  businessId: string;
  businessName: string;
  role: string;
  scopeKind: string;
  scopeId: string;
}>;

export const isControlGrant = (grant: EffectiveControlGrant): boolean =>
  grant.role === 'owner' || grant.role === 'manager';

export const controlCapabilitiesFor = (
  grants: readonly EffectiveControlGrant[],
  assuranceLevel: LoadedControlSession['principalAttributes']['assuranceLevel'],
): readonly ControlCapability[] => {
  if (assuranceLevel !== 'mfa') return ['control:view', 'auth:mfa:enroll'];

  const capabilities: ControlCapability[] = [
    'control:view',
    'team:read',
    'team:write',
    'customers:read',
    'customers:write',
    'orders:read',
    'orders:write',
    'security:read',
    'processor:view',
  ];
  if (grants.some((grant) => grant.role === 'owner'))
    capabilities.push('security:write');
  return capabilities;
};
