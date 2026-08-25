import { defineExperienceFeature } from "@pressly/cells"

export const processorIntakeFeature = defineExperienceFeature({
  id: "processor.intake",
  uses: [
    "processor.list-production-order-control.v1",
    "production.record-order-intake.v1",
    "production.change-admission.v1",
    "production.set-order-priority.v1",
  ],
  stateProofs: ["experiences/processor/src/features/intake/intake.test.tsx"],
  componentProofs: [
    "experiences/processor/src/features/intake/intake.test.tsx",
  ],
})
