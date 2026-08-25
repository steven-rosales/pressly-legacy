import { defineExperienceFeature } from "@pressly/cells"

export const controlConfigurationFeature = defineExperienceFeature({
  id: "control.configuration",
  uses: [],
  stateProofs: [
    "experiences/control/src/features/configuration/configuration-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/configuration/configuration-workspace.test.tsx",
  ],
})
