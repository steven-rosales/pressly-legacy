import type {
  ControlCustomer,
  ControlCustomerList,
  UserMutationResult,
  UserProfile,
} from "../contracts/customers.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlCustomerListInput = Readonly<{
  query: string
  active: boolean | null
  cursor: string | null
  limit?: number
}>

export type ControlCustomerOperations = Readonly<{
  listCustomers: GeneratedBrowserOperation<
    "control.list-customers.v1",
    Readonly<{ customers: BrowserHttpSurface<"GET"> }>
  >
  getCustomer: GeneratedBrowserOperation<
    "control.get-customer.v1",
    Readonly<{ request: BrowserHttpSurface<"GET"> }>
  >
  createCustomer: GeneratedBrowserOperation<
    "control.create-customer.v1",
    Readonly<{ customers: BrowserHttpSurface<"POST"> }>
  >
  updateCustomer: GeneratedBrowserOperation<
    "control.update-customer.v1",
    Readonly<{ request: BrowserHttpSurface<"PATCH"> }>
  >
}>

export type ControlCustomersBrowserClient = Readonly<{
  list: (input: ControlCustomerListInput) => Promise<ControlCustomerList>
  get: (customerId: string) => Promise<ControlCustomer>
  create: (profile: UserProfile) => Promise<UserMutationResult>
  update: (
    input: Readonly<{
      customerId: string
      expectedVersion: number
      changes: Partial<UserProfile> & Readonly<{ active?: boolean }>
    }>,
  ) => Promise<UserMutationResult>
}>
