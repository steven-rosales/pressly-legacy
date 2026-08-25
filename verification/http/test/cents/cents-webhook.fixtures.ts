export const documentedCentsOrderWebhook = {
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    orderCode: '00123',
    status: 'SUBMITTED',
    orderTotal: 29.99,
    balanceDue: 24.99,
    dueDate: '2026-07-12T21:00:00.000Z',
    updatedAt: '2026-07-12T15:59:00.000Z',
  },
  services: [
    {
      id: 43,
      name: 'Wash and Fold',
      quantity: 10,
      totalPrice: 29.99,
      unitCost: 2,
      serviceCategory: 'Wash and Fold',
      serviceCategoryType: 'LAUNDRY',
    },
  ],
  customer: {
    id: 815,
    firstName: 'Private Fixture',
    lastName: 'Customer',
    email: 'private@example.invalid',
    phoneNumber: '+15550000001',
  },
} as const;

export const documentedCentsCompletedOrderWebhook = {
  action: 'order_completed',
  order: {
    id: 12345,
    storeId: 24,
    status: 'COMPLETED',
    updatedAt: '2026-07-12T16:59:00.000Z',
  },
} as const;

export const documentedCentsCanceledOrderWebhook = {
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    status: 'CANCELED',
    updatedAt: '2026-07-12T16:59:00.000Z',
  },
} as const;

export const documentedCentsCustomerWebhook = {
  event: 'customer_updated',
  customer: {
    id: 815,
    firstName: 'Private Fixture',
    lastName: 'Customer',
    email: 'private@example.invalid',
    phoneNumber: '+15550000001',
    updatedAt: '2026-07-12T15:59:00.000Z',
  },
  customerMetrics: {
    totalOrderValue: 447.35,
  },
} as const;

export const documentedCentsMarketingWebhook = {
  event: 'customer_marketing_optin',
  customer: {
    id: 815,
    firstName: 'Private Fixture',
    lastName: 'Customer',
    email: 'private@example.invalid',
    phoneNumber: '+15550000001',
    updatedAt: '2026-07-12T15:59:00.000Z',
  },
} as const;

export const unsupportedCentsWebhook = {
  event: 'order_rescheduled_v2',
  order: {
    id: 12345,
    updatedAt: '2026-07-12T15:59:00.000Z',
    privateFutureField: 'must-not-survive',
  },
  customer: {
    email: 'private@example.invalid',
  },
} as const;
