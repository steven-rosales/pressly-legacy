import type { ControlAuthenticationApi } from "../../features/authentication/control-api"
import type { ControlCustomerApi } from "../../features/customers/customer-api"
import type { ControlOrderApi } from "../../features/orders/order-api"
import type { ControlSecurityApi } from "../../features/security/security-api"
import type { ControlInvitationApi } from "../../features/team/invitation-api"
import type { ControlTeamApi } from "../../features/team/team-api"

export type ControlRuntime = Readonly<{
  authentication: ControlAuthenticationApi
  team: ControlTeamApi
  security: ControlSecurityApi
  invitations: ControlInvitationApi
  customers: ControlCustomerApi
  orders: ControlOrderApi
  initialInvitationToken: string | null
}>
