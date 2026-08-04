export type ControlCapability =
  | 'control:view'
  | 'team:read'
  | 'team:write'
  | 'customers:read'
  | 'customers:write'
  | 'orders:read'
  | 'orders:write'
  | 'security:read'
  | 'security:write'
  | 'auth:mfa:enroll'
  | 'processor:view';

export type ControlSessionAssurance =
  | 'none'
  | 'password'
  | 'mfa'
  | 'service_key'
  | undefined;
