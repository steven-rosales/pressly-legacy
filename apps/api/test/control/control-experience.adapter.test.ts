import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { CanonicalOrderDetail, OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import { describe, expect, it } from 'vitest';
import {
  adaptControlCustomers,
  adaptControlOrders,
} from '../../src/http/control/control-experience.adapter.ts';

type CustomerSource = Pick<
  UsersApplication,
  'listUsers' | 'getUser' | 'createUser' | 'updateUser'
>;

const unused = async (): Promise<never> => {
  throw new Error('Unexpected test call.');
};

const customerSource = (
  listUsers: CustomerSource['listUsers'],
): CustomerSource => ({
  listUsers,
  getUser: unused,
  createUser: unused,
  updateUser: unused,
});

const listInput = {
  businessId: '00000000-0000-4000-8000-000000000100',
  query: null,
  active: null,
  limit: 25,
  cursor: null,
} as const;

type OrderSource = Pick<
  OrdersApplication,
  'listCanonicalOrders' | 'getCanonicalOrder' | 'createOrder' | 'correctOrder'
>;

const orderSource = (
  getCanonicalOrder: OrderSource['getCanonicalOrder'],
): OrderSource => ({
  listCanonicalOrders: unused,
  getCanonicalOrder,
  createOrder: unused,
  correctOrder: unused,
});

const orderDetail = (sourceMetadata: unknown): CanonicalOrderDetail =>
  ({
    orderId: 'order-1',
    businessId: listInput.businessId,
    orderVersion: 1,
    fulfillmentId: 'fulfillment-1',
    fulfillmentVersion: 1,
    displayNumber: '1001',
    state: 'open',
    dueAt: new Date('2026-08-04T00:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
    customer: {
      resolution: 'not_provided',
      userId: null,
      displayName: null,
      phone: null,
      email: null,
    },
    fulfillment: {
      typeCode: 'wash_fold',
      locationId: 'location-1',
      releaseState: 'unreleased',
      estimatedWeightLbs: null,
      estimatedWeightSource: null,
      bagCount: null,
    },
    items: [
      {
        lineKey: 'line-1',
        itemType: 'service',
        code: 'wash_fold',
        description: 'Wash and fold',
        quantity: 1,
        unit: 'each',
        unitPriceCents: 3_000,
        totalAmountCents: 3_000,
        sourceMetadata,
      },
    ],
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
  }) as CanonicalOrderDetail;

describe('Control experience peer adapter', () => {
  it('maps a feature-owned Users failure into typed Control rejection data', async () => {
    const customers = adaptControlCustomers(
      customerSource(async () =>
        result.err({
          kind: 'validation',
          code: 'user_cursor_invalid',
        } as const),
      ),
    );

    await expect(customers.list(listInput)).resolves.toEqual({
      tag: 'err',
      error: {
        kind: 'customer_rejected',
        category: 'validation',
        code: 'user_cursor_invalid',
        message: 'The customer request is invalid.',
      },
    });
  });

  it('throws an unexpected peer AppError unchanged', async () => {
    const sourceFailure = databaseError({
      code: 'users_query_failed',
      message: 'The Users query failed.',
    });
    const customers = adaptControlCustomers(
      customerSource(async () => {
        throw sourceFailure;
      }),
    );

    await expect(customers.list(listInput)).rejects.toBe(sourceFailure);
  });

  it('maps a feature-owned Orders failure into typed Control rejection data', async () => {
    const orders = adaptControlOrders(
      orderSource(async () =>
        result.err({
          kind: 'not_found',
          code: 'order_not_found',
          message: 'The Order was not found.',
        } as const),
      ),
    );

    await expect(
      orders.get({
        businessId: listInput.businessId,
        locationIds: ['location-1'],
        orderId: 'order-1',
      }),
    ).resolves.toEqual({
      tag: 'err',
      error: {
        kind: 'order_rejected',
        category: 'not_found',
        code: 'order_not_found',
        message: 'The Order was not found.',
      },
    });
  });

  it('accepts JSON order metadata at the Control boundary', async () => {
    const detail = orderDetail({ source: 'cents', nested: [true, null, 1] });
    const orders = adaptControlOrders(
      orderSource(async () => result.ok(detail)),
    );

    await expect(
      orders.get({
        businessId: listInput.businessId,
        locationIds: ['location-1'],
        orderId: detail.orderId,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { items: [{ sourceMetadata: detail.items[0]?.sourceMetadata }] },
    });
  });

  it('throws an invariant failure for non-JSON persisted order metadata', async () => {
    const orders = adaptControlOrders(
      orderSource(async () => result.ok(orderDetail(new Date()))),
    );

    await expect(
      orders.get({
        businessId: listInput.businessId,
        locationIds: ['location-1'],
        orderId: 'order-1',
      }),
    ).rejects.toMatchObject({
      kind: 'InvariantViolationError',
      code: 'control_order_source_metadata_invalid',
    });
  });
});
