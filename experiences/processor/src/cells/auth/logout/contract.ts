import {
  defineProcessorAuthContract,
  processorAuthFailureSchema,
  processorCookieSessionInputSchema,
  processorLogoutOutputSchema,
} from "../../../server/authentication/model.ts"

export const processorLogoutContract = defineProcessorAuthContract({
  label: "processor.logout.v1",
  input: processorCookieSessionInputSchema,
  output: processorLogoutOutputSchema,
  failure: processorAuthFailureSchema,
})
