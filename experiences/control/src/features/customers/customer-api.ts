import type {
  ControlCustomer,
  ControlCustomerList,
  UserMutationResult,
  UserProfile,
} from "../../browser/contracts/customers.ts"

export type CustomerListInput = Readonly<{
  query: string
  active: boolean | null
  cursor: string | null
  limit?: number
}>

export type ControlCustomerApi = Readonly<{
  list: (input: CustomerListInput) => Promise<ControlCustomerList>
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
