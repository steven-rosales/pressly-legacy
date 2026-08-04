import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import { makeControlCustomersApplication } from '../features/customers/manage-control-customers/manage-control-customers.usecase.ts';
import { makeControlInvitationsApplication } from '../features/invitations/manage-control-invitations/manage-control-invitations.usecase.ts';
import { makeControlOrdersApplication } from '../features/orders/manage-control-orders/manage-control-orders.usecase.ts';
import { makeReadControlSecurityEvents } from '../features/security/read-control-security-events/read-control-security-events.usecase.ts';
import { makeResolveControlAccess } from '../features/session/resolve-control-access/resolve-control-access.usecase.ts';
import { makeControlWorkforceApplication } from '../features/workforce/manage-control-workforce/manage-control-workforce.usecase.ts';
import { makePostgresControlAccessStore } from '../foundations/adapters/postgres/control-access-store/control-access-store.adapter.ts';
import type { ControlCustomersPort } from '../foundations/ports/control-customers/control-customers.port.ts';
import type { ControlOrdersPort } from '../foundations/ports/control-orders/control-orders.port.ts';
import type { ControlWorkforcePort } from '../foundations/ports/control-workforce/control-workforce.port.ts';

export type ControlExperienceDeps = Readonly<{
  db: Database;
  clock: Clock;
  controlOrigin: string;
  processorOrigin: string;
  customers: ControlCustomersPort;
  orders: ControlOrdersPort;
  workforce: ControlWorkforcePort;
}>;

export const makeControlExperience = (deps: ControlExperienceDeps) => {
  const access = makeResolveControlAccess({
    store: makePostgresControlAccessStore(deps.db),
    clock: deps.clock,
    controlOrigin: deps.controlOrigin,
    processorOrigin: deps.processorOrigin,
  });

  return Object.freeze({
    access,
    customers: makeControlCustomersApplication(deps.customers),
    orders: makeControlOrdersApplication(deps.orders),
    workforce: makeControlWorkforceApplication(deps.workforce),
    invitations: makeControlInvitationsApplication(deps.workforce),
    security: Object.freeze({
      listEvents: makeReadControlSecurityEvents(deps.workforce),
    }),
  });
};

export type ControlExperience = ReturnType<typeof makeControlExperience>;
