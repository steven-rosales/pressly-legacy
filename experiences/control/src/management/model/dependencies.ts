import type { AccessExperienceOperations } from "@pressly/access-system/capabilities/experience-access-v1"
import type { CustomerManagementOperations } from "@pressly/customers-system/capabilities/customer-management-v1"
import type { OrderManagementOperations } from "@pressly/orders-system/capabilities/order-management-v1"

type ExecuteOf<Cell> =
  Cell extends Readonly<{ execute: infer Execute }>
    ? Readonly<{ execute: Execute }>
    : never

export type AccessManagementExecute<
  Name extends keyof AccessExperienceOperations,
> = ExecuteOf<AccessExperienceOperations[Name]>

export type CustomerManagementExecute<
  Name extends keyof CustomerManagementOperations,
> = ExecuteOf<CustomerManagementOperations[Name]>

export type OrderManagementExecute<
  Name extends keyof OrderManagementOperations,
> = ExecuteOf<OrderManagementOperations[Name]>
