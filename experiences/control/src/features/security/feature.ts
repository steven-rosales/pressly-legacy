import { defineExperienceFeature } from "@pressly/cells"

export const controlSecurityFeature = defineExperienceFeature({
  id: "control.security",
  uses: [
    "control.list-identity-sessions.v1",
    "control.revoke-all-identity-sessions.v1",
    "control.revoke-identity-session.v1",
    "control.begin-mfa-enrollment.v1",
    "control.confirm-mfa-enrollment.v1",
    "control.regenerate-mfa-recovery-codes.v1",
    "control.remove-mfa.v1",
    "control.list-security-events.v1",
  ],
  stateProofs: [
    "experiences/control/src/features/security/security-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/security/security-workspace.test.tsx",
  ],
})
