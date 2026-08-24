import {
  defineProcessorAuthContract,
  processorAuthFailureSchema,
  processorCookieSessionInputSchema,
  processorSessionOutputSchema,
} from "../../../server/authentication/model.ts"

export const processorLoadSessionContract = defineProcessorAuthContract({
  label: "processor.load-auth-session.v1",
  input: processorCookieSessionInputSchema,
  output: processorSessionOutputSchema,
  failure: processorAuthFailureSchema,
})
