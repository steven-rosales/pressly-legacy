import type {
  IncomingOrderProposal,
  OrderManagementPort,
} from "../../src/capabilities/order-management.port"
import { testLocation } from "./production.fixture"

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`

export const testIncomingOrderProposal: IncomingOrderProposal = {
  id: id(701),
  version: 1,
  state: "pending",
  source: "cents",
  externalOrderId: "CENTS-2481",
  locationId: testLocation.id,
  displayNumber: "2481",
  customer: {
    displayName: "Santiago Jackson",
    phone: "+18622917798",
    email: "santiago@example.com",
  },
  dueAt: "2026-08-01T22:00:00.000Z",
  estimatedWeightLbs: 17,
  sourceReportedAt: "2026-08-01T17:20:00.000Z",
  reportedAt: "2026-08-01T17:21:00.000Z",
  sourceClosure: null,
  availableActions: ["accept", "reject"],
  acceptBlockedReason: null,
}

export const testSourceClosedOrderProposal: IncomingOrderProposal = {
  ...testIncomingOrderProposal,
  version: 2,
  state: "source_closed",
  sourceClosure: {
    kind: "completed",
    observedAt: "2026-08-02T13:00:00.000Z",
  },
  availableActions: ["restore"],
}

export const makeTestOrderManagementPort = (
  overrides: Partial<OrderManagementPort> = {}
): OrderManagementPort => ({
  listIncomingOrders: async () => ({
    items: [],
    nextCursor: null,
  }),
  acceptIncomingOrder: async ({ proposalId }) => ({
    proposalId,
    state: "accepted",
    version: 2,
    orderId: id(702),
    fulfillmentId: id(703),
    replayed: false,
  }),
  rejectIncomingOrder: async ({ proposalId }) => ({
    proposalId,
    state: "rejected",
    version: 2,
    orderId: null,
    fulfillmentId: null,
    replayed: false,
  }),
  restoreIncomingOrder: async ({ proposalId }) => ({
    proposalId,
    state: "restored_pending",
    version: 3,
    replayed: false,
  }),
  ...overrides,
})
