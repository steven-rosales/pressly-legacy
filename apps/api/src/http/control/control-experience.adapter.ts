import type { WorkforceApplication, WorkforceFailure } from '@pressly/identity';
import { isJsonObject, type JsonObject } from '@pressly/codec';
import type {
  ControlCustomerRejection,
  ControlCustomerCapabilities,
  ControlOrderDetailSnapshot,
  ControlOrderItem,
  ControlOrderCapabilities,
  ControlWorkforceCapabilities,
} from '@pressly/control-experience';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  CanonicalOrderDetail,
  CorrectOrderFailure,
  CreateOrderFailure,
  GetCanonicalOrderFailure,
  ListCanonicalOrdersFailure,
  OrdersApplication,
} from '@pressly/orders';
import type { Result } from '@pressly/kernel';
import { result } from '@pressly/kernel';
import type {
  CreateUserFailure,
  GetUserFailure,
  ListUsersFailure,
  UpdateUserFailure,
  UsersApplication,
} from '@pressly/users';

type ExpectedCategory =
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'rate_limit';

type ExpectedRejection<Kind extends string> = Readonly<{
  kind: Kind;
  category: ExpectedCategory;
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

const adaptWorkforceResult = async <Value>(
  outcome: Promise<Result<Value, WorkforceFailure>>,
): Promise<Result<Value, ExpectedRejection<'workforce_rejected'>>> => {
  const resolved = await outcome;
  if (!result.isErr(resolved)) return resolved;

  return result.err({
    kind: 'workforce_rejected',
    category: resolved.error.kind,
    code: resolved.error.code,
    message: resolved.error.message,
    ...(resolved.error.details === undefined
      ? {}
      : { details: resolved.error.details }),
  });
};

type CustomerFailure =
  | CreateUserFailure
  | UpdateUserFailure
  | ListUsersFailure
  | GetUserFailure;

const customerFailureMessage = (failure: CustomerFailure): string => {
  switch (failure.kind) {
    case 'validation':
      return 'The customer request is invalid.';
    case 'not_found':
      return 'The customer was not found.';
    case 'conflict':
      return failure.code === 'user_version_conflict'
        ? 'The customer changed. Refresh and try again.'
        : 'The customer request conflicts with current state.';
  }
};

const adaptCustomerResult = async <Value>(
  outcome: Promise<Result<Value, CustomerFailure>>,
): Promise<Result<Value, ControlCustomerRejection>> => {
  const resolved = await outcome;
  return result.isErr(resolved)
    ? result.err({
        kind: 'customer_rejected',
        category: resolved.error.kind,
        code: resolved.error.code,
        message: customerFailureMessage(resolved.error),
      })
    : resolved;
};

type OrderFailure =
  | GetCanonicalOrderFailure
  | ListCanonicalOrdersFailure
  | CreateOrderFailure
  | CorrectOrderFailure;

const adaptOrderResult = async <Value>(
  outcome: Promise<Result<Value, OrderFailure>>,
): Promise<Result<Value, ExpectedRejection<'order_rejected'>>> => {
  const resolved = await outcome;
  return result.isErr(resolved)
    ? result.err({
        kind: 'order_rejected',
        category: resolved.error.kind,
        code: resolved.error.code,
        message: resolved.error.message,
      })
    : resolved;
};

const validateControlOrderDetail = (
  order: CanonicalOrderDetail,
): ControlOrderDetailSnapshot => ({
  ...order,
  items: order.items.map((item) => {
    if (!isJsonObject(item.sourceMetadata))
      throw invariantViolationError({
        code: 'control_order_source_metadata_invalid',
        message: `Order ${order.orderId} item ${item.lineKey} contains non-JSON source metadata.`,
        safeMessage: 'Order data could not be loaded.',
      });

    return { ...item, sourceMetadata: item.sourceMetadata };
  }),
});

type CanonicalControlOrderItem = Omit<ControlOrderItem, 'sourceMetadata'> &
  Readonly<{ sourceMetadata: JsonObject }>;

const validateControlOrderItems = (
  items: readonly ControlOrderItem[],
): readonly CanonicalControlOrderItem[] =>
  items.map((item) => {
    if (!isJsonObject(item.sourceMetadata))
      throw invariantViolationError({
        code: 'control_order_item_source_metadata_invalid',
        message: `Control order item ${item.lineKey} contains non-object JSON source metadata.`,
        safeMessage: 'Order data could not be submitted.',
      });

    return { ...item, sourceMetadata: item.sourceMetadata };
  });

export const adaptControlCustomers = (
  users: Pick<
    UsersApplication,
    'listUsers' | 'getUser' | 'createUser' | 'updateUser'
  >,
): ControlCustomerCapabilities => ({
  list: (input) => adaptCustomerResult(users.listUsers(input)),
  get: (input) => adaptCustomerResult(users.getUser(input)),
  create: (input) => adaptCustomerResult(users.createUser(input)),
  update: (input) => adaptCustomerResult(users.updateUser(input)),
});

export const adaptControlOrders = (
  orders: Pick<
    OrdersApplication,
    'listCanonicalOrders' | 'getCanonicalOrder' | 'createOrder' | 'correctOrder'
  >,
): ControlOrderCapabilities => ({
  list: (input) => adaptOrderResult(orders.listCanonicalOrders(input)),
  get: async (input) => {
    const order = await adaptOrderResult(orders.getCanonicalOrder(input));
    return result.isErr(order)
      ? order
      : result.ok(validateControlOrderDetail(order.value));
  },
  create: (input) =>
    adaptOrderResult(
      orders.createOrder({
        ...input,
        items: validateControlOrderItems(input.items),
      }),
    ),
  correct: ({ changes, ...input }) => {
    const { items, ...remainingChanges } = changes;
    return adaptOrderResult(
      orders.correctOrder({
        ...input,
        changes: {
          ...remainingChanges,
          ...(items === undefined
            ? {}
            : { items: validateControlOrderItems(items) }),
        },
      }),
    );
  },
});

export const adaptControlWorkforce = (
  workforce: WorkforceApplication,
): ControlWorkforceCapabilities => ({
  listMembers: (input) => adaptWorkforceResult(workforce.listWorkforce(input)),
  getMember: (input) =>
    adaptWorkforceResult(workforce.getWorkforceMember(input)),
  listMemberSessions: (input) =>
    adaptWorkforceResult(workforce.listMemberSessions(input)),
  revokeMemberSessions: (input) =>
    adaptWorkforceResult(workforce.revokeMemberSessions(input)),
  listInvitations: (input) =>
    adaptWorkforceResult(workforce.listInvitations(input)),
  issueInvitation: (input) =>
    adaptWorkforceResult(workforce.issueInvitation(input)),
  reissueInvitation: (input) =>
    adaptWorkforceResult(workforce.reissueInvitation(input)),
  revokeInvitation: (input) =>
    adaptWorkforceResult(workforce.revokeInvitation(input)),
  transitionMembership: ({ transition, ...input }) =>
    adaptWorkforceResult(
      transition === 'suspend'
        ? workforce.suspendMembership(input)
        : transition === 'reactivate'
          ? workforce.reactivateMembership(input)
          : workforce.endMembership(input),
    ),
  grantAccess: (input) => adaptWorkforceResult(workforce.grantAccess(input)),
  revokeAccess: (input) => adaptWorkforceResult(workforce.revokeAccess(input)),
  previewInvitation: (acceptanceToken) =>
    adaptWorkforceResult(workforce.previewInvitation(acceptanceToken)),
  acceptInvitation: ({ acceptanceToken, ...input }) =>
    adaptWorkforceResult(
      workforce.acceptInvitation({
        ...input,
        rawToken: acceptanceToken,
      }),
    ),
  listSecurityEvents: (input) =>
    adaptWorkforceResult(workforce.listSecurityEvents(input)),
});
