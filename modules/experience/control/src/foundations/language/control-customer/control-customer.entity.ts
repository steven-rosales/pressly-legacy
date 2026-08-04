import type { ControlCustomerProfile } from './control-customer.value.ts';

export type ControlCustomerEntity = ControlCustomerProfile &
  Readonly<{
    id: string;
    businessId: string;
    version: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
