import { defineExperienceFeature } from "@pressly/cells"

export const processorSchedulingFeature = defineExperienceFeature({
  id: "processor.scheduling",
  uses: [
    "processor.load-production-workspace.v1",
    "production.create-shift.v1",
    "production.update-shift.v1",
    "production.replace-shift-selection.v1",
    "production.create-schedule.v1",
    "production.load-schedule.v1",
    "production.accept-schedule.v1",
    "production.start-schedule.v1",
    "production.set-order-priority.v1",
    "production.place-order-automatically.v1",
    "production.place-order-exactly.v1",
    "production.confirm-order-overtime.v1",
    "production.subscribe-changes.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/scheduling/scheduling.test.tsx",
    "experiences/processor/src/features/scheduling/live-run-changes.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/scheduling/scheduling.test.tsx",
    "experiences/processor/src/features/scheduling/live-run-changes.test.tsx",
  ],
})
