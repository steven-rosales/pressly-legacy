export const documentedCentsOrderWebhook = {
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    status: 'IN_PROGRESS',
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
