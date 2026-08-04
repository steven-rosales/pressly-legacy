export type OperationalOrderIdentity = Readonly<{
  displayNumber: string;
  customerDisplayName: string | null;
}>;

export type OperationalOrderIdentityReference = Readonly<{
  referenceId: string;
  productionOrderId: string | null;
  orderDemandId: string | null;
  fallbackDisplayNumber: string;
}>;

export type CanonicalOrderContext = Readonly<{
  canonicalOrderId: string;
  canonicalFulfillmentId: string;
  displayNumber: string | null;
  customer: Readonly<{
    resolution:
      | 'resolved'
      | 'not_provided'
      | 'pending'
      | 'conflict'
      | 'legacy_unknown';
    userId: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    phone: string | null;
  }>;
  commercialState: 'open' | 'completed' | 'canceled';
  admissionState: 'unreleased' | 'released' | 'withdrawn';
  versions: Readonly<{
    order: number;
    fulfillment: number;
  }>;
}>;

export type OperationalOrderIdentityResolution = Readonly<{
  identity: OperationalOrderIdentity;
  canonical: CanonicalOrderContext | null;
}>;

export type OperationalOrderAuditEntry = Readonly<{
  kind: 'source_observation' | 'order_command' | 'production_command';
  code: string;
  occurredAt: string;
  actor: string;
  outcome: string | null;
}>;

export type OperationalOrderContext = CanonicalOrderContext &
  Readonly<{
    source: Readonly<{ name: string }> | null;
    audit: readonly OperationalOrderAuditEntry[];
  }>;

export type OperationalOrderContextResolution = Readonly<{
  identity: OperationalOrderIdentity;
  canonical: OperationalOrderContext | null;
}>;

export type OperationalOrderAuditFacts = Readonly<{
  sources: readonly Readonly<{
    canonicalOrderId: string;
    name: string;
    observedAt: Date;
  }>[];
  orderCommands: readonly Readonly<{
    canonicalOrderId: string;
    code: string;
    actorId: string;
    occurredAt: Date;
  }>[];
  productionCommands: readonly Readonly<{
    productionOrderId: string;
    code: string;
    actorId: string;
    occurredAt: Date;
  }>[];
}>;
