import { defineExperienceFeature } from "@pressly/cells"

export const processorAuthenticationFeature = defineExperienceFeature({
  id: "processor.authentication",
  uses: [
    "processor.auth-login.v1",
    "processor.complete-mfa-challenge.v1",
    "processor.load-auth-session.v1",
    "processor.logout.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/authentication/authentication.view.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/authentication/authentication.view.test.tsx",
  ],
})
