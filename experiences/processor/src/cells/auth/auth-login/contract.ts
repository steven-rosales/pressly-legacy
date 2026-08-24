import {
  defineProcessorAuthContract,
  processorAuthFailureSchema,
  processorLoginInputSchema,
  processorLoginOutputSchema,
} from "../../../server/authentication/model.ts"

export const processorLoginContract = defineProcessorAuthContract({
  label: "processor.auth-login.v1",
  input: processorLoginInputSchema,
  output: processorLoginOutputSchema,
  failure: processorAuthFailureSchema,
})
