import type { WorkforceApplication } from '@pressly/identity';
import { makeControlExperience } from '@pressly/control-experience';
import type { Database } from '@pressly/db/client';
import type { OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import {
  adaptControlCustomers,
  adaptControlOrders,
  adaptControlWorkforce,
} from '../../src/http/control/control-experience.adapter.ts';

export const makeTestControlExperience = (input: {
  users?: UsersApplication;
  orders?: OrdersApplication;
  workforce?: WorkforceApplication;
}) =>
  makeControlExperience({
    db: {} as Database,
    clock: { now: () => new Date('2026-08-03T16:00:00.000Z') },
    controlOrigin: 'https://control.example.com',
    processorOrigin: 'https://processor.example.com',
    customers: adaptControlCustomers(input.users ?? ({} as UsersApplication)),
    orders: adaptControlOrders(input.orders ?? ({} as OrdersApplication)),
    workforce: adaptControlWorkforce(
      input.workforce ?? ({} as WorkforceApplication),
    ),
  });
