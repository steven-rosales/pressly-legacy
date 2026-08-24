import type { AdminCliAuthDependencies } from "./auth-dependencies.ts"
import type { AdminCliPricingDependencies } from "./pricing-dependencies.ts"
import { adminCliAuthLoginCellDeclaration } from "../cells/cli/auth-login/cell.ts"
import { makeAdminCliAuthLoginCell } from "../cells/cli/auth-login/execute.ts"
import { adminCliAuthLogoutCellDeclaration } from "../cells/cli/auth-logout/cell.ts"
import { makeAdminCliAuthLogoutCell } from "../cells/cli/auth-logout/execute.ts"
import { adminCliAuthMfaConfirmCellDeclaration } from "../cells/cli/auth-mfa-confirm/cell.ts"
import { makeAdminCliAuthMfaConfirmCell } from "../cells/cli/auth-mfa-confirm/execute.ts"
import { adminCliAuthMfaEnrollCellDeclaration } from "../cells/cli/auth-mfa-enroll/cell.ts"
import { makeAdminCliAuthMfaEnrollCell } from "../cells/cli/auth-mfa-enroll/execute.ts"
import { adminCliAuthMfaRecoveryCodesCellDeclaration } from "../cells/cli/auth-mfa-recovery-codes/cell.ts"
import { makeAdminCliAuthMfaRecoveryCodesCell } from "../cells/cli/auth-mfa-recovery-codes/execute.ts"
import { adminCliAuthMfaRemoveCellDeclaration } from "../cells/cli/auth-mfa-remove/cell.ts"
import { makeAdminCliAuthMfaRemoveCell } from "../cells/cli/auth-mfa-remove/execute.ts"
import { adminCliAuthSessionCellDeclaration } from "../cells/cli/auth-session/cell.ts"
import { makeAdminCliAuthSessionCell } from "../cells/cli/auth-session/execute.ts"
import { adminCliPricingPlanCellDeclaration } from "../cells/cli/pricing-plan/cell.ts"
import { makeAdminCliPricingPlanCell } from "../cells/cli/pricing-plan/execute.ts"
import { adminCliPricingPublishCellDeclaration } from "../cells/cli/pricing-publish/cell.ts"
import { makeAdminCliPricingPublishCell } from "../cells/cli/pricing-publish/execute.ts"
import { adminCliPricingShowCellDeclaration } from "../cells/cli/pricing-show/cell.ts"
import { makeAdminCliPricingShowCell } from "../cells/cli/pricing-show/execute.ts"
import { adminCliProductionBootstrapCellDeclaration } from "../cells/cli/bootstrap-production/cell.ts"
import {
  makeAdminCliProductionBootstrapCell,
  type AdminCliProductionBootstrapDependencies,
} from "../cells/cli/bootstrap-production/execute.ts"

export type AdminCliExperienceDependencies = Readonly<{
  auth: AdminCliAuthDependencies
  pricing: AdminCliPricingDependencies
  productionBootstrap: AdminCliProductionBootstrapDependencies
}>

export const adminCliAuthCellDeclarations = Object.freeze({
  login: adminCliAuthLoginCellDeclaration,
  session: adminCliAuthSessionCellDeclaration,
  logout: adminCliAuthLogoutCellDeclaration,
  mfaEnroll: adminCliAuthMfaEnrollCellDeclaration,
  mfaConfirm: adminCliAuthMfaConfirmCellDeclaration,
  mfaRecoveryCodes: adminCliAuthMfaRecoveryCodesCellDeclaration,
  mfaRemove: adminCliAuthMfaRemoveCellDeclaration,
})

export const adminCliPricingCellDeclarations = Object.freeze({
  show: adminCliPricingShowCellDeclaration,
  plan: adminCliPricingPlanCellDeclaration,
  publish: adminCliPricingPublishCellDeclaration,
})

export const adminCliCellDeclarations = Object.freeze({
  ...adminCliAuthCellDeclarations,
  ...adminCliPricingCellDeclarations,
  productionBootstrap: adminCliProductionBootstrapCellDeclaration,
})

export const makeAdminCliExperience = (
  dependencies: AdminCliExperienceDependencies,
) =>
  Object.freeze({
    cells: Object.freeze({
      login: makeAdminCliAuthLoginCell(dependencies.auth),
      session: makeAdminCliAuthSessionCell(dependencies.auth),
      logout: makeAdminCliAuthLogoutCell(dependencies.auth),
      mfaEnroll: makeAdminCliAuthMfaEnrollCell(dependencies.auth),
      mfaConfirm: makeAdminCliAuthMfaConfirmCell(dependencies.auth),
      mfaRecoveryCodes: makeAdminCliAuthMfaRecoveryCodesCell(dependencies.auth),
      mfaRemove: makeAdminCliAuthMfaRemoveCell(dependencies.auth),
      show: makeAdminCliPricingShowCell(dependencies.pricing),
      plan: makeAdminCliPricingPlanCell(dependencies.pricing),
      publish: makeAdminCliPricingPublishCell(dependencies.pricing),
      productionBootstrap: makeAdminCliProductionBootstrapCell(
        dependencies.productionBootstrap,
      ),
    }),
  })

export type AdminCliExperience = ReturnType<typeof makeAdminCliExperience>
