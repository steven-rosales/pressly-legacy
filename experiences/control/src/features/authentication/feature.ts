import { defineExperienceFeature } from "@pressly/cells"

export const controlAuthenticationFeature = defineExperienceFeature({
  id: "control.authentication",
  uses: [
    "control.auth-login.v1",
    "control.complete-mfa-challenge.v1",
    "control.load-auth-session.v1",
    "control.logout.v1",
  ],
  stateProofs: [
    "experiences/control/src/features/authentication/use-authentication.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/authentication/authentication-view.test.tsx",
  ],
})
