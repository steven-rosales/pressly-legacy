export type ProcessorCapability =
  | 'processor:view'
  | 'production:read'
  | 'production:schedule'
  | 'production:accept'
  | 'production:start'
  | 'production:queue'
  | 'production:override'
  | 'production:priority'
  | 'production:intake'
  | 'production:admission'
  | 'production:resources'
  | 'production:stage';

export type ProcessorRole =
  | 'owner'
  | 'manager'
  | 'admin'
  | 'operator'
  | 'customer'
  | 'driver'
  | 'service'
  | 'developer'
  | 'ci';

export type ProcessorScope =
  | Readonly<{ kind: 'global'; id: '*' }>
  | Readonly<{ kind: 'business'; id: string }>
  | Readonly<{ kind: 'location'; id: string }>
  | Readonly<{ kind: 'resource'; type: string; id: string }>;

export type ProcessorRoleAssignment = Readonly<{
  role: ProcessorRole;
  scope: ProcessorScope;
  state?: 'active' | 'revoked' | 'expired';
  version?: number;
  startsAt?: Date;
  endsAt?: Date;
}>;

export type ProcessorSession = Readonly<{
  principal: Readonly<{
    identityId: string;
    kind: 'human' | 'service';
    displayName: string;
    email?: string;
    sessionId?: string;
    sessionIssuedAt?: Date;
    sessionExpiresAt?: Date;
  }>;
  principalAttributes: Readonly<{
    assignments: readonly ProcessorRoleAssignment[];
    identityActive: boolean;
    assuranceLevel?: 'password' | 'mfa' | 'service_key';
  }>;
}>;

export type ProcessorLocationAuthority = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
}>;

export type ProcessorApplication = Readonly<{
  id: 'processor' | 'control';
  label: string;
  description: string;
  href: string;
}>;

export type ProcessorAccess = Readonly<{
  locations: readonly Readonly<{
    id: string;
    name: string;
    timezone: string;
    capabilities: readonly ProcessorCapability[];
  }>[];
  applications: readonly ProcessorApplication[];
}>;

export type ProcessorApplicationOrigins = Readonly<{
  processor: string;
  control: string;
}>;
