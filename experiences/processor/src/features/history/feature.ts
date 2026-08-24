import { defineExperienceFeature } from "@pressly/cells"

export const processorHistoryFeature = defineExperienceFeature({
  id: "processor.history",
  uses: [
    "processor.list-production-history-activity.v1",
    "processor.load-production-history-run.v1",
    "production.list-history-plans.v1",
    "production.list-history-runs.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/history/history-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/history/history-workspace.test.tsx",
  ],
})
