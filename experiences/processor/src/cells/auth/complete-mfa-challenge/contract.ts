import {
  defineProcessorAuthContract,
  processorAuthFailureSchema,
  processorChallengeInputSchema,
  processorSessionOutputSchema,
} from "../../../server/authentication/model.ts"

export const processorCompleteMfaChallengeContract =
  defineProcessorAuthContract({
    label: "processor.complete-mfa-challenge.v1",
    input: processorChallengeInputSchema,
    output: processorSessionOutputSchema,
    failure: processorAuthFailureSchema,
  })
