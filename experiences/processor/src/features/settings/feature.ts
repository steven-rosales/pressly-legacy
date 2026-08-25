import { defineExperienceFeature } from "@pressly/cells"

export const processorSettingsFeature = defineExperienceFeature({
  id: "processor.settings",
  uses: ["production.publish-scheduler-config.v1"],
  stateProofs: [
    "experiences/processor/src/features/settings/scheduler-config-publication.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/settings/scheduler-config-publication.test.tsx",
  ],
})
