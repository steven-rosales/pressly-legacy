import type { ControlHttpClient } from "@/api/control-http-client"
import {
  controlCustomerPageSchema,
  controlCustomerSchema,
  customerMutationResultSchema,
  type ControlCustomer,
  type ControlCustomerPage,
  type CustomerMutationResult,
  type CustomerProfile,
} from "./customer-model"

export type CustomerListInput = Readonly<{
  query: string
  active: boolean | null
  cursor: string | null
  limit?: number
}>

export type ControlCustomerApi = Readonly<{
  list: (input: CustomerListInput) => Promise<ControlCustomerPage>
  get: (customerId: string) => Promise<ControlCustomer>
  create: (profile: CustomerProfile) => Promise<CustomerMutationResult>
  update: (input: {
    customerId: string
    expectedVersion: number
    changes: Partial<CustomerProfile> & { active?: boolean }
  }) => Promise<CustomerMutationResult>
}>

const idempotencyKey = () => crypto.randomUUID()

const queryString = (input: CustomerListInput) => {
  const parameters = new URLSearchParams()
  if (input.query.trim().length > 0) parameters.set("query", input.query.trim())
  if (input.active !== null) parameters.set("active", String(input.active))
  if (input.cursor !== null) parameters.set("cursor", input.cursor)
  parameters.set("limit", String(input.limit ?? 25))
  return parameters.toString()
}

export function makeControlCustomerApi(
  client: ControlHttpClient,
): ControlCustomerApi {
  return {
    list: (input) =>
      client.request(
        { path: `/control/customers?${queryString(input)}` },
        controlCustomerPageSchema,
      ),
    get: (customerId) =>
      client.request(
        { path: `/control/customers/${encodeURIComponent(customerId)}` },
        controlCustomerSchema,
      ),
    create: (profile) =>
      client.request(
        {
          method: "POST",
          path: "/control/customers",
          csrf: true,
          body: { idempotencyKey: idempotencyKey(), profile },
        },
        customerMutationResultSchema,
      ),
    update: ({ customerId, expectedVersion, changes }) =>
      client.request(
        {
          method: "PATCH",
          path: `/control/customers/${encodeURIComponent(customerId)}`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            expectedVersion,
            changes,
          },
        },
        customerMutationResultSchema,
      ),
  }
}
