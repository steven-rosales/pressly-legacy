import { defineExperienceFeature } from "@pressly/cells"

export const processorForecastFeature = defineExperienceFeature({
  id: "processor.forecast",
  uses: ["processor.load-remaining-day-forecast.v1"],
  stateProofs: [
    "experiences/processor/src/features/forecast/forecast.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/forecast/forecast.test.tsx",
  ],
})
