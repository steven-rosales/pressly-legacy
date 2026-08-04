import type { ControlCustomerEntity } from './control-customer.entity.ts';

export type ControlCustomerSnapshot = ControlCustomerEntity &
  Readonly<{
    displayName: string;
    possibleDuplicateCount: number;
  }>;

export type ControlCustomer = Omit<
  ControlCustomerSnapshot,
  'businessId' | 'createdAt' | 'updatedAt'
> &
  Readonly<{
    createdAt: string;
    updatedAt: string;
  }>;

export type ControlCustomerList = Readonly<{
  items: readonly ControlCustomer[];
  nextCursor: string | null;
}>;

export type ControlCustomerMutation = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;
