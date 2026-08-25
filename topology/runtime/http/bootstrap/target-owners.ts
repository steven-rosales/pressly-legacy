import {
  makeAccessSystem,
  type AccessSystem,
  type AccessSystemDependencies,
} from '@pressly/access-system';
import {
  makeCustomersSystem,
  type CustomersSystem,
} from '@pressly/customers-system';
import {
  makeControlExperience,
  type ControlBrowserPresentation,
  type ControlExperience,
} from '@pressly/experience-control';
import {
  makeCustomerExperience,
  type CustomerExperience,
} from '@pressly/experience-customer';
import {
  makeProcessorExperience,
  makeProcessorOperationalOrderCapabilities,
  type ProcessorBrowserPresentation,
  type ProcessorExperience,
  type ProcessorServerProductionQueries,
} from '@pressly/experience-processor/server';
import {
  makeIngressSystem,
  type IngressSystem,
  type IngressStateSystemDependencies,
} from '@pressly/ingress-system';
import { makeOrdersSystem, type OrdersSystem } from '@pressly/orders-system';
import { makePricingSystem, type PricingSystem } from '@pressly/pricing-system';
import {
  makeProductionSystem,
  type ProductionSystemDependencies,
} from '@pressly/production-system';
import type { TypedPostgresDatabase } from '@pressly/postgres/client';
import {
  presslyPostgresOwnerSchemas,
  type PresslyPostgresSchema,
} from '@pressly/topology/postgres-schema';
import type { Clock } from '@pressly/time';

type AccessConfiguration = Omit<
  AccessSystemDependencies,
  'clock' | 'db' | 'schema'
>;
type ProductionConfiguration = Omit<
  ProductionSystemDependencies,
  | 'clock'
  | 'db'
  | 'ids'
  | 'productionActorReadV1'
  | 'productionScopeReconciliationV1'
  | 'schema'
>;
type IngressConfiguration = Omit<
  IngressStateSystemDependencies,
  'clock' | 'db' | 'ids' | 'schema'
>;

type ProductionSystemCells = ReturnType<typeof makeProductionSystem>['cells'];
type ProcessorProductionQueryCellName =
  | 'loadBoard'
  | 'previewOrderBacklog'
  | 'loadWorkspace'
  | 'loadRemainingDayForecast'
  | 'listHistoryActivity'
  | 'loadHistoryRun'
  | 'listOrderControl';
type ProcessorProductionQueryCells = Readonly<{
  [Name in ProcessorProductionQueryCellName]: Readonly<{
    execute: ProductionSystemCells[Name]['execute'];
  }>;
}>;

const processorProductionQueries = (
  production: ProcessorProductionQueryCells,
): ProcessorServerProductionQueries =>
  Object.freeze({
    loadBoard: (input) => production.loadBoard.execute(input),
    previewOrderBacklog: (input) =>
      production.previewOrderBacklog.execute(input),
    loadWorkspace: (input) => production.loadWorkspace.execute(input),
    loadRemainingDayForecast: (input) =>
      production.loadRemainingDayForecast.execute(input),
    listHistoryActivity: (input) =>
      production.listHistoryActivity.execute({
        locationId: input.locationId,
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        ...(input.entityType === undefined
          ? {}
          : { entityType: input.entityType }),
        ...(input.eventType === undefined
          ? {}
          : { eventType: input.eventType }),
        ...(input.orderResolution === undefined
          ? {}
          : { orderResolution: input.orderResolution }),
        ...(input.search === undefined ? {} : { search: input.search }),
        ...(input.occurredAfter === undefined
          ? {}
          : { occurredAfter: input.occurredAfter }),
      }),
    loadHistoryRun: (input) => production.loadHistoryRun.execute(input),
    listOrderControl: (input) =>
      production.listOrderControl.execute({
        locationId: input.locationId,
        view: input.view,
        limit: input.limit,
        ...(input.search === undefined ? {} : { search: input.search }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.dueBucket === undefined
          ? {}
          : { dueBucket: input.dueBucket }),
        ...(input.productionRunId === undefined
          ? {}
          : { productionRunId: input.productionRunId }),
        ...(input.productionBatchId === undefined
          ? {}
          : { productionBatchId: input.productionBatchId }),
        ...(input.stage === undefined ? {} : { stage: input.stage }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.movable === undefined ? {} : { movable: input.movable }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      }),
  });

export type ApiTargetOwnerCompositionDependencies = Readonly<{
  db: TypedPostgresDatabase<PresslyPostgresSchema>;
  clock: Clock;
  ids: ProductionSystemDependencies['ids'] &
    IngressStateSystemDependencies['ids'];
  access: AccessConfiguration;
  production?: ProductionConfiguration;
  ingress?: IngressConfiguration;
  control: Readonly<{
    presentation: ControlBrowserPresentation;
    origin: string;
  }>;
  processor: Readonly<{
    presentation: ProcessorBrowserPresentation;
    origin: string;
  }>;
}>;

export type ApiTargetOwners = Readonly<{
  systems: Readonly<{
    access: AccessSystem;
    customers: CustomersSystem;
    orders: OrdersSystem;
    pricing: PricingSystem;
    production: ReturnType<typeof makeProductionSystem>;
    ingress: IngressSystem;
  }>;
  experiences: Readonly<{
    customer: CustomerExperience;
    control: ControlExperience;
    processor: ProcessorExperience;
  }>;
}>;

const customerExperienceFrom = (access: ReturnType<typeof makeAccessSystem>) =>
  makeCustomerExperience({
    login: access.cells.login,
    loadSession: access.cells.loadSession,
    revokeSession: access.cells.revokeSession,
    completeMfaChallenge: access.cells.completeMfaChallenge,
    listIdentitySessions: access.cells.listIdentitySessions,
    revokeIdentitySessions: access.cells.revokeIdentitySessions,
    beginMfaEnrollment: access.cells.beginMfaEnrollment,
    confirmMfaEnrollment: access.cells.confirmMfaEnrollment,
    regenerateMfaRecoveryCodes: access.cells.regenerateMfaRecoveryCodes,
    removeMfa: access.cells.removeMfa,
  });

const ordersFrom = (
  dependencies: Pick<ApiTargetOwnerCompositionDependencies, 'clock' | 'db'>,
  customers: CustomersSystem,
  access: AccessSystem,
): OrdersSystem =>
  makeOrdersSystem({
    ...dependencies,
    schema: presslyPostgresOwnerSchemas.orders,
    orderLocationFactsV1: access.capabilities.orderLocationFactsV1,
    customerReferenceV1: customers.capabilities.customerReferenceV1,
    resolveExactSourceCustomerV1:
      customers.capabilities.resolveExactSourceCustomerV1,
  });

export const makeApiTargetOwners = (
  dependencies: ApiTargetOwnerCompositionDependencies,
): ApiTargetOwners => {
  const access = makeAccessSystem({
    db: dependencies.db,
    schema: presslyPostgresOwnerSchemas.access,
    clock: dependencies.clock,
    ...dependencies.access,
  });
  const customers = makeCustomersSystem({
    db: dependencies.db,
    schema: presslyPostgresOwnerSchemas.customers,
    clock: dependencies.clock,
  });
  const orders = ordersFrom(dependencies, customers, access);
  const pricing = makePricingSystem({
    db: dependencies.db,
    schema: presslyPostgresOwnerSchemas.pricing,
    clock: dependencies.clock,
  });
  const production = makeProductionSystem({
    db: dependencies.db,
    schema: presslyPostgresOwnerSchemas.production,
    clock: dependencies.clock,
    ids: dependencies.ids,
    productionActorReadV1: access.capabilities.productionActorReadV1,
    productionScopeReconciliationV1:
      access.capabilities.productionScopeReconciliationV1,
    ...dependencies.production,
  });
  const ingress = makeIngressSystem({
    db: dependencies.db,
    schema: presslyPostgresOwnerSchemas.ingress,
    clock: dependencies.clock,
    ids: dependencies.ids,
    ...dependencies.ingress,
    processInboundEvent: {
      proposeIncomingOrder: (input) =>
        orders.cells.proposeIncomingOrder.execute(input),
      closeIncomingOrderSource: (input) =>
        orders.cells.closeIncomingOrderSource.execute(input),
      resolveSourceClosedFulfillment: (input) =>
        production.cells.resolveSourceClosedFulfillment.execute(input),
    },
  });
  const customer = customerExperienceFrom(access);
  const control = makeControlExperience({
    access: {
      login: access.cells.login,
      loadSession: access.cells.loadSession,
      revokeSession: access.cells.revokeSession,
      completeMfaChallenge: access.cells.completeMfaChallenge,
      listIdentitySessions: access.cells.listIdentitySessions,
      revokeIdentitySessions: access.cells.revokeIdentitySessions,
      beginMfaEnrollment: access.cells.beginMfaEnrollment,
      confirmMfaEnrollment: access.cells.confirmMfaEnrollment,
      regenerateMfaRecoveryCodes: access.cells.regenerateMfaRecoveryCodes,
      removeMfa: access.cells.removeMfa,
      listEffectiveAccessGrants: access.cells.listEffectiveAccessGrants,
      listActiveBusinessLocations: access.cells.listActiveBusinessLocations,
      listWorkforce: access.cells.listWorkforce,
      getWorkforceMember: access.cells.getWorkforceMember,
      listWorkforceMemberSessions: access.cells.listWorkforceMemberSessions,
      revokeWorkforceMemberSessions: access.cells.revokeWorkforceMemberSessions,
      listWorkforceInvitations: access.cells.listWorkforceInvitations,
      issueWorkforceInvitation: access.cells.issueWorkforceInvitation,
      reissueWorkforceInvitation: access.cells.reissueWorkforceInvitation,
      revokeWorkforceInvitation: access.cells.revokeWorkforceInvitation,
      transitionWorkforceMembership: access.cells.transitionWorkforceMembership,
      grantWorkforceAccess: access.cells.grantWorkforceAccess,
      revokeWorkforceAccess: access.cells.revokeWorkforceAccess,
      listWorkforceSecurityEvents: access.cells.listWorkforceSecurityEvents,
      previewWorkforceInvitation: access.cells.previewWorkforceInvitation,
      acceptWorkforceInvitation: access.cells.acceptWorkforceInvitation,
    },
    customers: {
      listCustomers: customers.cells.listCustomers,
      getCustomer: customers.cells.getCustomer,
      createCustomer: customers.cells.createCustomer,
      updateCustomer: customers.cells.updateCustomer,
    },
    orders: {
      listOrders: orders.cells.listCanonicalOrders,
      getOrder: orders.cells.getCanonicalOrder,
      createOrder: orders.cells.createOrder,
      correctOrder: orders.cells.correctOrder,
    },
    presentation: dependencies.control.presentation,
    controlOrigin: dependencies.control.origin,
    processorOrigin: dependencies.processor.origin,
  });
  const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({
    production: production.capabilities,
    orders: orders.capabilities,
  });
  const processor = makeProcessorExperience({
    production: processorProductionQueries(production.cells),
    ...processorOperationalOrders,
    login: access.cells.login,
    loadSession: access.cells.loadSession,
    revokeSession: access.cells.revokeSession,
    completeMfaChallenge: access.cells.completeMfaChallenge,
    presentation: dependencies.processor.presentation,
    listActiveProductionLocations: access.cells.listActiveProductionLocations,
    resolveProductionCapabilities: access.productionCapabilitiesForLocation,
    clock: dependencies.clock,
    origins: {
      processor: dependencies.processor.origin,
      control: dependencies.control.origin,
    },
  });

  return Object.freeze({
    systems: Object.freeze({
      access,
      customers,
      orders,
      pricing,
      production,
      ingress,
    }),
    experiences: Object.freeze({ customer, control, processor }),
  });
};
