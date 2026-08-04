import type { EffectiveControlGrant } from '../../../foundations/language/control-access/control-access.model.ts';
import type {
  ControlCapability,
  ControlSessionAssurance,
} from '../../../foundations/language/control-access/control-access.value.ts';

export const isControlGrant = (grant: EffectiveControlGrant): boolean =>
  grant.role === 'owner' || grant.role === 'manager';

export const controlCapabilitiesFor = (
  grants: readonly EffectiveControlGrant[],
  assuranceLevel: ControlSessionAssurance,
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
