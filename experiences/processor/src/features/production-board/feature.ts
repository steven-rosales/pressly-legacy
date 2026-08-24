import { defineExperienceFeature } from "@pressly/cells"

export const processorProductionBoardFeature = defineExperienceFeature({
  id: "processor.production-board",
  uses: [
    "processor.load-production-board.v1",
    "production.advance-stage.v1",
    "production.assign-stage-machines.v1",
    "production.freeze-batch-membership.v1",
    "production.unfreeze-batch-membership.v1",
    "production.reconcile-batch-progress.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/production-board/production-board.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/production-board/production-board.test.tsx",
  ],
})
