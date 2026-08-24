import { makeAccessSchema } from '@pressly/access-system/schema';
import { makeCustomersSchema } from '@pressly/customers-system/schema';
import { makeIngressSchema } from '@pressly/ingress-system/schema';
import { makeOrdersSchema } from '@pressly/orders-system/schema';
import { makePricingSchema } from '@pressly/pricing-system/schema';
import { makeProductionSchema } from '@pressly/production-system/schema';

const access = makeAccessSchema();
const customers = makeCustomersSchema();
const orders = makeOrdersSchema();
const pricing = makePricingSchema();
const production = makeProductionSchema();
const ingress = makeIngressSchema();

export const presslyPostgresOwnerSchemas = Object.freeze({
  access,
  customers,
  ingress,
  orders,
  pricing,
  production,
});

export const presslyPostgresSchema = Object.freeze({
  ...presslyPostgresOwnerSchemas.access,
  ...presslyPostgresOwnerSchemas.customers,
  ...presslyPostgresOwnerSchemas.ingress,
  ...presslyPostgresOwnerSchemas.orders,
  ...presslyPostgresOwnerSchemas.pricing,
  ...presslyPostgresOwnerSchemas.production,
});

export type PresslyPostgresOwnerSchemas = typeof presslyPostgresOwnerSchemas;
export type PresslyPostgresSchema = typeof presslyPostgresSchema;
