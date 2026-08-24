import { defineExperienceFeature } from "@pressly/cells"

export const processorLocationSelectionFeature = defineExperienceFeature({
  id: "processor.location-selection",
  uses: ["production.list-locations.v1"],
  stateProofs: [
    "experiences/processor/src/features/location-selection/location-selection.view.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/location-selection/location-selection.view.test.tsx",
  ],
})
